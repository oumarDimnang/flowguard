import { Eyebrow, Glyph, Status } from '@/components/primitives';
import { confidence } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Criticality, type DecisionRecord } from '@/types';
import { ToolboxBoundary } from './toolbox-boundary';

/**
 * What the model actually concluded, and how it got there.
 *
 * The richest step in the trail and the one worth the most room. Four things,
 * in order of how convincing they are: the verdict, the reasoning verbatim, the
 * path the reasoning graph took, and the evidence the agent chose to go and
 * fetch on its own.
 */
export function AssessmentDetail({ record }: { record: DecisionRecord }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Status
          kind={record.criticality === Criticality.HIGH ? 'filled' : 'hollow'}
          className={cn(
            'datum text-[15px] font-medium',
            record.criticality === Criticality.HIGH && 'text-primary',
          )}
        >
          {record.criticality ?? 'UNKNOWN'}
        </Status>

        <span className="datum text-[13px]">
          confidence <span className="text-muted-foreground">{confidence(record.criticalityConfidence)}</span>
        </span>

        {record.modelId ? (
          <span className="datum text-[13px]">
            model <span className="text-muted-foreground">{record.modelId}</span>
          </span>
        ) : null}

        {record.error ? (
          <Status kind="slash" className="text-[13px] text-destructive">
            fallback applied — {record.error}
          </Status>
        ) : null}
      </div>

      {/*
       * Verbatim, at reading size, never truncated. The model's own
       * justification is the most persuasive artifact in the product; putting
       * it behind an expander or clipping it to a line would be discarding the
       * thing people actually came to see.
       */}
      {record.reasoning ? (
        <blockquote className="max-w-[68ch] border-l pl-4 text-[15px] leading-relaxed">
          {record.reasoning}
        </blockquote>
      ) : null}

      {record.graphTrace?.length ? <GraphTrace trace={record.graphTrace} /> : null}
      {record.toolCalls?.length ? <ToolCalls calls={record.toolCalls} /> : null}

      <ToolboxBoundary called={record.toolCalls} />
    </div>
  );
}

/**
 * The route the reasoning graph took.
 *
 * Worth showing because it is not a straight line: low confidence sends it back
 * to `classify` after gathering evidence, so a trace that visits the same node
 * twice is the escalation working rather than a rendering bug.
 */
function GraphTrace({ trace }: { trace: string[] }) {
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <Eyebrow>Reasoning path</Eyebrow>
      <ol className="flex flex-col gap-1">
        {trace.map((step, index) => (
          <li
            key={`${step}-${index}`}
            className={cn(
              'datum status-line text-[11px] tracking-[0.04em]',
              // Tool lines arrive indented from the agent; keep that shape.
              step.startsWith(' ') && 'pl-4 text-muted-foreground',
            )}
          >
            <Glyph kind="filled" />
            {step.trim()}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Which read-only signals the agent decided to consult.
 *
 * Nobody told it to. On a real run against the leak-inspection scenario the
 * model chose `retrieve_device_location` unprompted, which is the moment the
 * word "agent" stops being marketing.
 */
function ToolCalls({ calls }: { calls: NonNullable<DecisionRecord['toolCalls']> }) {
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <Eyebrow>Evidence the agent chose to gather</Eyebrow>

      {calls.map((call, index) => (
        <div key={`${call.name}-${index}`} className="flex flex-col gap-1 border-t py-2 first:border-t-0">
          <Status kind={call.failed ? 'slash' : 'filled'} className="datum text-[13px]">
            <span className={call.failed ? 'text-destructive' : undefined}>{call.name}</span>
          </Status>

          {call.arguments && Object.keys(call.arguments).length > 0 ? (
            <span className="datum pl-4 text-[11px] text-muted-foreground">
              {JSON.stringify(call.arguments)}
            </span>
          ) : null}

          {call.result !== undefined ? (
            <span className="max-w-[68ch] pl-4 text-[13px] text-muted-foreground">
              {typeof call.result === 'string' ? call.result : JSON.stringify(call.result)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
