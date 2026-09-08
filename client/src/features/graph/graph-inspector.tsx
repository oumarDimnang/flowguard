import { logTime } from '@/lib/format';
import type { GraphNode } from './graph-model';

/**
 * What one node is, and who decided it.
 *
 * A rail beside the scene, never a modal — the whole value of clicking a node
 * is comparing what it says against where it sits, and a dialogue that covers
 * the graph destroys that.
 *
 * "Who decided this" is the headline rather than a footnote, because it is the
 * question the visualisation exists to answer.
 */
export function GraphInspector({
  node,
  story,
}: {
  node: GraphNode | undefined;
  story?: readonly string[];
}) {
  return (
    <aside
      className="scroll-area flex max-h-[640px] min-w-0 flex-col gap-4 border-l py-5 pl-6"
      style={{ borderColor: 'var(--edge)' }}
      aria-live="polite"
    >
      {node ? <Selected node={node} /> : <Empty story={story} />}
    </aside>
  );
}

function Selected({ node }: { node: GraphNode }) {
  const agent = node.kind === 'agent' || node.kind === 'tool';

  return (
    <>
      <header className="flex flex-col gap-1">
        <Label>node</Label>
        <h2 className="datum text-[17px] font-medium [overflow-wrap:anywhere]">{node.name}</h2>
        <span className="datum text-xs" style={{ color: 'var(--ink-dim)' }}>
          {statusText(node)}
        </span>
      </header>

      <section
        className="flex flex-col gap-1 border-t pt-3"
        style={{ borderColor: 'var(--ink-dim)' }}
      >
        <Label>who decided this</Label>
        <p
          className="text-[17px] font-semibold"
          style={{ color: node.kind === 'deterministic' ? 'var(--machine)' : 'var(--agent)' }}
        >
          {node.who}
        </p>
        <p style={{ color: 'var(--ink-dim)' }}>{node.meaning}</p>
      </section>

      <Block label="what it did">
        <p>{node.did}</p>
      </Block>

      {node.payload.length > 0 ? (
        <Block label="payload">
          <dl className="datum grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-xs leading-relaxed">
            {node.payload.map((entry) => (
              <div key={entry.key} className="contents">
                <dt style={{ color: 'var(--ink-dim)' }}>{entry.key}</dt>
                <dd className="m-0 [overflow-wrap:anywhere]">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </Block>
      ) : null}

      <Block label="when">
        <dl className="datum grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-xs">
          <dt style={{ color: 'var(--ink-dim)' }}>at</dt>
          <dd className="m-0">{node.at ? logTime(node.at) : '—'}</dd>

          {agent && node.confidence ? (
            <>
              <dt style={{ color: 'var(--ink-dim)' }}>confidence</dt>
              <dd className="m-0">{node.confidence}</dd>
            </>
          ) : null}
        </dl>
      </Block>

      {node.alternatives?.length ? (
        <Block label="branches not taken">
          <ul className="flex flex-col gap-1.5">
            {node.alternatives.map((alternative) => (
              <li key={alternative.name} className="flex flex-col text-xs">
                <span className="datum inline-flex items-center gap-2">
                  <i
                    aria-hidden="true"
                    className="inline-block size-1.5 rounded-full border"
                    style={{ borderColor: 'var(--ink-dim)', boxSizing: 'border-box' }}
                  />
                  {alternative.name}
                </span>
                <span className="pl-3.5" style={{ color: 'var(--ink-dim)' }}>
                  {alternative.why}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </>
  );
}

/**
 * The resting state.
 *
 * Carries the whole story in sentences, then explains the two classes of
 * object — in that order, because a reader who has not been told the
 * distinction reads the scene as decoration, but a reader who does not know
 * what happened has no reason to care about either.
 */
function Empty({ story }: { story?: readonly string[] }) {
  return (
    <>
      <Label>what happened</Label>

      {story?.length ? (
        <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
          {story.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--ink-dim)' }}>No decisions recorded for this operation.</p>
      )}

      <p className="pt-1 text-xs" style={{ color: 'var(--ink-dim)' }}>
        Select a node to read who decided it, what it did, and its payload.
      </p>

      <div className="flex flex-col gap-3 border-t pt-3" style={{ borderColor: 'var(--edge)' }}>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 font-medium">
            <i
              aria-hidden="true"
              className="inline-block size-2.5 rounded-full"
              style={{ background: 'var(--sphere-agent)', boxShadow: '0 0 8px 2px var(--glow-agent)' }}
            />
            Agent-decided
          </span>
          <span className="pl-4.5 text-xs" style={{ color: 'var(--ink-dim)' }}>
            Warm, breathing, off the rail. The model chose this path; it can differ run to run.
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 font-medium">
            <i
              aria-hidden="true"
              className="inline-block size-2 rounded-full"
              style={{ background: 'var(--sphere-machine)' }}
            />
            Deterministic
          </span>
          <span className="pl-4.5 text-xs" style={{ color: 'var(--ink-dim)' }}>
            Cool, still, on a straight rail. Identical every run, exhaustively tested.
          </span>
        </div>
      </div>

      <dl
        className="datum grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 border-t pt-3 text-xs"
        style={{ borderColor: 'var(--edge)' }}
      >
        <dt style={{ color: 'var(--ink-dim)' }}>z 0</dt>
        <dd className="m-0">deterministic rail</dd>
        <dt style={{ color: 'var(--ink-dim)' }}>z −300</dt>
        <dd className="m-0">agent reasoning</dd>
        <dt style={{ color: 'var(--ink-dim)' }}>z −520</dt>
        <dd className="m-0">evidence &amp; toolbox</dd>
      </dl>
    </>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: 'var(--edge)' }}>
      <Label>{label}</Label>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="datum text-[11px] tracking-[0.08em] uppercase"
      style={{ color: 'var(--ink-dim)' }}
    >
      {children}
    </span>
  );
}

function statusText(node: GraphNode): string {
  switch (node.status) {
    case 'reached':
      return node.kind === 'deterministic' ? 'reached · workflow step' : 'reached · chosen';
    case 'skipped':
      return 'not taken on this run';
    default:
      return 'available · not called';
  }
}
