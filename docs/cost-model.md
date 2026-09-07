# Cost model

A simple, honest comparison — not a claim about Nokia's actual QoD pricing,
which isn't public in the sandbox we tested against. Treat the dollar
figures below as illustrative placeholders for the pitch; swap in a real
per-device premium-connectivity rate if a partner operator shares one.

## The formula

```
Always-on premium connectivity:
  N devices × premium_rate × 24h × operating_days

FlowGuard:
  N devices × premium_rate × (actual minutes each device held QoD/slice) / 60
```

The saving is the gap between those two — connectivity purchased only for
the minutes an operation was actually classified critical, not for every
minute a device could theoretically need it.

## Worked example (illustrative rate)

Assume a facility with **100 devices** capable of QoD/slice escalation, a
**$5/hour** premium-connectivity rate (placeholder — not a Nokia quote), over
one **8-hour operating day**:

| | Always-on | FlowGuard |
|---|---|---|
| Connectivity purchased | 100 × 8h = 800 device-hours | 100 × (critical minutes only) |
| At the demo's real 44% reduction rate | — | ~448 device-hours |
| Cost at $5/hr | $4,000/day | ~$2,240/day |
| Annualised (250 operating days) | $1,000,000/yr | ~$560,000/yr |

The percentage reduction (44% in the last live measurement — see
[`docs/evidence.md`](evidence.md) for how to regenerate it) is a real,
reproducible number from the decision log. The dollar figures around it are
illustrative until a real per-device rate is available — say so on the slide
rather than presenting them as a vendor quote.

## Where this can come from in the running system

`GET /metrics` already returns `premiumReductionPct` and the raw counts
(`byAction`) needed to compute device-hours saved for a specific rate —
no new backend code is required to put a live number on the dashboard, just
multiplying that percentage by whatever rate and device count the pitch
wants to illustrate.
