import { Eyebrow, Glyph } from '@/components/primitives';
import { cn } from '@/lib/utils';
import { AGENT_READ_TOOLS, AGENT_WRITE_TOOLS, type ToolCall } from '@/types';

export interface ToolboxBoundaryProps {
  /** Tools the agent actually invoked on this operation. */
  called?: ToolCall[];
}

/**
 * The agency boundary, drawn as a specification.
 *
 * Two columns: everything the model can read, and everything it can write.
 * The second column is empty, and that emptiness is the entire safety
 * argument — the model chooses what to *look at*; deterministic code chooses
 * what to *do*.
 *
 * This is not a claim the UI makes on the agent's behalf. It mirrors
 * `agent/src/flowguard_agent/tools/network_tools.py`, where the toolbox
 * exposes four read tools and no write tool, and a test fails the build if
 * anyone adds one. The boundary is enforced by absence, not by policy.
 *
 * Placed beside the tool calls rather than on a page of its own, so a reader
 * sees what the agent chose next to the full set it had — including the option
 * it never had.
 */
export function ToolboxBoundary({ called }: ToolboxBoundaryProps) {
  const invoked = new Set((called ?? []).map((call) => call.name));

  return (
    <div className="grid grid-cols-1 gap-6 border-t pt-4 sm:grid-cols-2 sm:gap-10">
      <div className="flex flex-col gap-2">
        <Eyebrow>Read — available to the model</Eyebrow>
        <ul className="flex flex-col">
          {AGENT_READ_TOOLS.map((tool) => (
            <li
              key={tool}
              className={cn(
                'datum status-line border-t py-1.5 text-[13px]',
                invoked.has(tool) ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <Glyph kind={invoked.has(tool) ? 'filled' : 'hollow'} />
              {tool}
              {invoked.has(tool) ? (
                <span className="ml-auto text-[11px] text-primary">called</span>
              ) : null}
            </li>
          ))}
          <li className="border-t" />
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Eyebrow>Write — available to the model</Eyebrow>

        {AGENT_WRITE_TOOLS.length === 0 ? (
          <div className="flex flex-col border-t">
            {/* A ruled void, deliberately the same height as the column beside
                it. An empty list that collapses to nothing reads as an
                oversight; one that holds its space reads as a statement. */}
            <div className="flex min-h-[7.5rem] flex-col justify-center gap-1.5 border-b border-dashed py-4">
              <p className="text-[15px] font-medium">No write tools exist.</p>
              <p className="max-w-[42ch] text-xs text-muted-foreground">
                The model cannot create a QoD session, attach a slice, or release one — not
                because it is instructed not to, but because no such tool is in its toolbox. A
                test fails the build if one is ever added.
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col">
            {AGENT_WRITE_TOOLS.map((tool) => (
              <li key={tool} className="datum border-t py-1.5 text-[13px] text-destructive">
                {tool}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
