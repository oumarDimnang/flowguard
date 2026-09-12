# Deploying FlowGuard to AWS

A single EC2 instance running all three services behind Caddy, deployed by
GitHub Actions on every push to `master`.

**You SSH in exactly twice.** Once at step 8 to install the runtimes, once at
step 12 to seed the database. After that every change ships by pushing to
`master` — you should not need a shell on the box again except to read logs.

Budget about 45 minutes for the first run, most of it waiting for DNS.

```
                   ┌─────────────────────── EC2 t3.small, eu-central-1 ───┐
  app.<domain> ──► │ Caddy :443 ──► /opt/flowguard/client   (static SPA)  │
  api.<domain> ──► │        └────► :3000  NestJS ──┐                      │
                   │                               ├──► :7233 Temporal    │
                   │               Python worker ──┘        (loopback)    │
                   └──────────────────────────────────────────────────────┘
                                      │
                        MongoDB Atlas ─┘  (allowlisted to the Elastic IP)
```

---

## Before you start

- An AWS account.
- A domain from GoDaddy (or any registrar). Buy it now — DNS is the slowest step.
- Your MongoDB Atlas connection string.
- A terminal with `ssh`, `scp` and `ssh-keygen`. Git Bash on Windows is fine.

Throughout, replace `<domain>` with the domain you bought and `<EIP>` with the
Elastic IP from step 4.

---

## 1. Generate three secrets

On your own machine. Keep the output somewhere temporary — you will paste these
into GitHub at step 10, and never need them again.

```bash
node -e "for (const k of ['SESSION_SECRET','INTERNAL_API_TOKEN','NOKIA_WEBHOOK_TOKEN']) console.log(k+'='+require('crypto').randomBytes(32).toString('hex'))"
```

`SESSION_SECRET` has a hard 32-character floor enforced at boot; these are 64.

## 2. Create an SSH key pair for yourself

This is *your* interactive key, separate from the one GitHub Actions will use.

AWS console → **EC2** → set the region to **Europe (Frankfurt) eu-central-1**
in the top-right selector *before anything else* → **Network & Security → Key
Pairs** → **Create key pair**.

- Name: `flowguard-admin`
- Type: **ED25519**, Format: **.pem**
- Create — the browser downloads `flowguard-admin.pem`.

```bash
chmod 400 ~/Downloads/flowguard-admin.pem
```

> Region matters: Frankfurt is the same region as your Atlas cluster and the
> closest to Nokia's `p-eu` API hub. Everything after this must be created in
> the same region or it will not see the instance.

## 3. Launch the instance

**EC2 → Instances → Launch instances.**

| Field | Value |
|---|---|
| Name | `flowguard-demo` |
| AMI | **Ubuntu Server 24.04 LTS**, 64-bit (x86) |
| Instance type | **t3.small** |
| Key pair | `flowguard-admin` |
| Network settings → Edit | Allow **SSH** from Anywhere, tick **Allow HTTPS** and **Allow HTTP** from the internet |
| Configure storage | **20 GiB**, **gp3** |

**Launch instance**, then wait for Instance state `Running` and Status check
`2/2 checks passed`.

> Port 22 is open to the world because GitHub-hosted runners have no stable IP
> range worth allowlisting. `bootstrap.sh` turns off password and root login, so
> keys are the only way in. If you would rather lock it down, restrict SSH to
> your own IP and run deploys with `workflow_dispatch` from a self-hosted runner.

## 4. Give it a fixed address

**EC2 → Network & Security → Elastic IPs → Allocate Elastic IP address →
Allocate.** Then select the new address → **Actions → Associate Elastic IP
address** → Resource type **Instance** → pick `flowguard-demo` → **Associate**.

Write down the address. This is `<EIP>`.

**Do not skip this.** Atlas allowlists a specific IP. Without an Elastic IP,
every stop/start hands the instance a new address and your database locks you
out — which is also what makes the cost-saving trick in "Day to day" safe.

## 5. Check the firewall

**EC2 → Instances →** select `flowguard-demo` **→ Security tab →** click the
security group. Inbound rules should be exactly:

| Port | Source |
|---|---|
| 22 | 0.0.0.0/0 |
| 80 | 0.0.0.0/0 |
| 443 | 0.0.0.0/0 |

Port 80 is not optional — Let's Encrypt validates over it. Nothing else should
be open; Temporal stays on loopback.

## 6. Point the domain at it (GoDaddy)

GoDaddy → **My Products** → your domain → **DNS** → **Manage DNS**. Add two
**A** records:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `app` | `<EIP>` | 600 |
| A | `api` | `<EIP>` | 600 |

That gives you `app.<domain>` and `api.<domain>`. A low TTL means you can
repoint quickly if you rebuild the box.

**Both names must be on the same domain.** The session cookie is `sameSite:
'lax'`, which is scoped to the registrable domain — `app.<domain>` and
`api.<domain>` are the same site, so the cookie is sent. Put the dashboard on a
different domain (a `*.vercel.app` or CloudFront URL) and the browser silently
stops sending it: login appears to succeed, then every request 401s.

Wait for propagation before step 11:

```bash
nslookup app.<domain>
```

## 7. Let Atlas accept the box

MongoDB Atlas → **Network Access** → **Add IP Address** → enter `<EIP>/32` →
Confirm. Wait for status **Active**.

## 8. First SSH — install the runtimes

The only time you touch the box by hand.

```bash
scp -i ~/Downloads/flowguard-admin.pem deploy/bootstrap.sh ubuntu@<EIP>:~
```

```bash
ssh -i ~/Downloads/flowguard-admin.pem ubuntu@<EIP> 'sudo bash bootstrap.sh'
```

It installs Node 22, uv, the Temporal CLI and Caddy, creates the `flowguard`
service user and `/opt/flowguard`, adds 2 GB of swap, and disables password and
root SSH. It is safe to re-run. It prints the installed versions when it
finishes.

It deliberately does **not** install the app, the systemd units or the Caddy
config — those ship with the code, so changing a unit file is a push rather than
an untracked edit on a box nobody remembers touching.

## 9. Create the deploy key

A second key, used only by GitHub Actions, so revoking it never locks you out.

```bash
ssh-keygen -t ed25519 -C flowguard-deploy -f ~/.ssh/flowguard-deploy -N ""
```

Authorise it on the box:

```bash
ssh -i ~/Downloads/flowguard-admin.pem ubuntu@<EIP> "echo '$(cat ~/.ssh/flowguard-deploy.pub)' >> ~/.ssh/authorized_keys"
```

Capture the host's fingerprint, so the workflow verifies what it connects to
instead of blindly trusting it:

```bash
ssh-keyscan <EIP>
```

## 10. Configure GitHub

Repository → **Settings** → **Secrets and variables** → **Actions**.

**Variables** tab (not secret — these end up in the client bundle or in logs):

| Name | Value |
|---|---|
| `SSH_HOST` | `<EIP>` |
| `APP_DOMAIN` | `app.<domain>` |
| `API_DOMAIN` | `api.<domain>` |

Optional variables, each with a working default if you leave it unset:
`SSH_USER` (`ubuntu`), `MONGODB_DB_NAME` (`flowguard`), `NETWORK_PROVIDER`
(`mock`), `LLM_PROVIDER` (`mock`), `LLM_MODEL`, `LLM_FALLBACK_MODELS`,
`LLM_CONFIDENCE_THRESHOLD`, `NOKIA_BASE_URL`, `NOKIA_RAPIDAPI_HOST`,
`NOKIA_QOS_PROFILE`, `NOKIA_APPLICATION_SERVER_IPV4`, `NOKIA_SLICE_ID`,
`POLICY_FAIL_OPEN`, `POLICY_ALWAYS_PROTECT_SAFETY_CRITICAL`.

**Secrets** tab:

| Name | Where it comes from |
|---|---|
| `SSH_PRIVATE_KEY` | contents of `~/.ssh/flowguard-deploy` (the whole file, including the BEGIN/END lines) |
| `SSH_KNOWN_HOSTS` | the output of the `ssh-keyscan` above |
| `MONGODB_URI` | Atlas |
| `SESSION_SECRET` | step 1 |
| `INTERNAL_API_TOKEN` | step 1 |
| `NOKIA_WEBHOOK_TOKEN` | step 1 |
| `NOKIA_API_KEY` | Nokia, only if `NETWORK_PROVIDER=nokia` |
| `OPENROUTER_API_KEY` | OpenRouter, only if `LLM_PROVIDER=openrouter` |

`INTERNAL_API_TOKEN` and `NOKIA_WEBHOOK_TOKEN` are written into both
`server/.env` and `agent/.env` by the same workflow step, so they cannot drift
apart. That mismatch is the worst failure in this system to diagnose: the
agent's decision events get 401'd and the dashboard just stays empty.

## 11. Deploy

Push to `master`, or **Actions → Deploy → Run workflow**.

The workflow runs the server and agent test suites, builds both front and back
ends on the runner, ships the output, writes the `.env` files, installs the
systemd units, renders and validates the Caddy config, installs dependencies,
restarts the services, and runs eight smoke checks. First run takes 3–5 minutes;
Caddy issues the TLS certificates during it.

If DNS has not propagated, Caddy cannot get a certificate and the public checks
fail. Wait and re-run.

## 12. Second SSH — seed the database

Nobody can log in until this runs once. There is no sign-up route by design.

```bash
ssh -i ~/Downloads/flowguard-admin.pem ubuntu@<EIP> 'cd /opt/flowguard/server && node dist/seed'
```

Run `node dist/seed` directly, not `npm run seed` — that shells out to `nest
build`, which needs devDependencies the box does not have, and would wipe the
deployed `dist/`.

> **The seeded password is hardcoded `flowguard` in `server/src/seed.ts`**,
> shared by all four accounts and printed to stdout. It is in the repository, so
> treat the host as publicly accessible from this moment. The seed is
> find-or-create, so editing that file and re-running will **not** rotate an
> existing password — you would have to drop the `users` collection first.

## 13. Verify

The workflow checks most of this, but these two need a browser:

1. `https://app.<domain>/demo` — loads signed out. It makes no API calls, so it
   isolates Caddy and the SPA build.
2. Sign in, then hard-refresh. If the session survives, `NODE_ENV=production`,
   `trust proxy` and TLS all line up. If login "succeeds" and then bounces you,
   that is the cookie, not your password.
3. With DevTools open, confirm the `/live` WebSocket connects. The client sets
   `transports: ['websocket']` with polling disabled, so there is no fallback —
   if the upgrade does not survive the proxy, live updates die silently.
4. Run a scenario from the Control Room and watch the decision trail populate.
   That is the end-to-end proof the two `.env` files agree.

---

## Day to day

**Deploy:** push to `master`.

**Logs:**

```bash
ssh -i ~/Downloads/flowguard-admin.pem ubuntu@<EIP> 'sudo journalctl -u flowguard-server -f'
```

Swap in `flowguard-agent`, `flowguard-temporal` or `caddy`.

**Temporal Web UI** — not exposed; tunnel to it, then open <http://localhost:8233>:

```bash
ssh -i ~/Downloads/flowguard-admin.pem -L 8233:localhost:8233 ubuntu@<EIP>
```

**Cut the bill by ~6×.** A stopped instance bills no compute. **EC2 → Instances
→ Instance state → Stop instance** between demos and start it again when you
need it; the Elastic IP and the DNS records survive, so nothing needs
reconfiguring. Roughly $5.45/month idle plus $0.023/hour while running, against
~$22/month left on continuously.

**Before a demo,** take a rollback point: **Instances →** select **→ Actions →
Image and templates → Create image**. Restoring is faster than debugging.

---

## When something breaks

| Symptom | Cause |
|---|---|
| Deploy fails at the TLS check | DNS not propagated, or port 80 closed. `sudo journalctl -u caddy -n 50` |
| Login succeeds then every request 401s | The cookie. `NODE_ENV` must be `production`, and both hostnames must share one domain |
| Dashboard loads, no live updates | WebSocket upgrade blocked. There is no polling fallback |
| Dashboard loads, decision trail stays empty | `INTERNAL_API_TOKEN` differs between the two `.env` files, or Caddy is 404ing `/internal/*` for the agent — it should reach the server on loopback, bypassing Caddy |
| `/health` returns 503 | Mongo or Temporal is down. The body names which |
| Agent unit `active` but nothing happens | It is stuck in `provider.bootstrap()` before it ever polls — most likely `NETWORK_PROVIDER=nokia` with an unreachable sandbox. `temporal task-queue describe --task-queue flowguard` shows no poller |
| Agent unit `failed` after a few restarts | The same thing, having hit the 5-in-300s limit. Working as intended: it fails loudly instead of looping |
| Everything 502s after a deploy | `sudo systemctl status flowguard-server`. Usually a missing required variable — the server validates its whole environment at boot and refuses to start |
