import { Link } from 'react-router';

import { Eyebrow, Glyph, Skeleton } from '@/components/primitives';
import { NetworkAction, type DecisionRecord, type Operation } from '@/types';
import { summariseOperation } from './operation-summary';

export interface OperationSummaryPanelProps {
  operation: Operation | undefined;
  records: readonly DecisionRecord[];
  loading?: boolean;
}

/**
 * The shift note above the audit trail.
 *
 * The trail below it is complete and in order, which makes it correct and slow
 * to read: seven steps, each with a payload, and the actual finding — that a
 * rule and not a model committed the network — is spread across three of them.
 * This says it in a paragraph, then gets out of the way.
 *
 * It is a projection of the records directly beneath it, so it can be checked
 * line by line against them. Nothing here is fetched, stored or generated.
 */
export function OperationSummaryPanel({
  operation,
  records,
  loading,
}: OperationSummaryPanelProps) {
  if (loading && records.length === 0) return <SummarySkeleton />;

  const summary = summariseOperation(operation, records);

  return (
    <div className="flex flex-col gap-4 border-t pt-4 pb-2">
      <p className="flex items-baseline gap-2 text-[17px] font-medium">
        <Glyph kind={protectedRun(summary.verdict?.action) ? 'filled' : 'hollow'} />
        <span className={protectedRun(summary.verdict?.action) ? 'text-primary' : undefined}>
          {summary.headline}
        </span>
      </p>

      {summary.pending ? (
        <p className="datum text-xs text-muted-foreground">{summary.pending}</p>
      ) : null}

      <div className="log-row">
        <Eyebrow className="pt-1">what happened</Eyebrow>
        <div className="flex max-w-[74ch] flex-col gap-2.5 text-[15px] leading-relaxed">
          {summary.narrative.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>

      {summary.verdict ? (
        <div className="log-row">
          <Eyebrow className="pt-1">decided</Eyebrow>
          <p className="datum flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
            <span
              className={
                protectedRun(summary.verdict.action) ? 'font-medium text-primary' : 'font-medium'
              }
            >
              {summary.verdict.action}
            </span>
            {summary.verdict.rule ? (
              <>
                <span className="text-muted-foreground">by</span>
                {/* Linked, because the claim "a readable rule decided this" is
                    only worth anything if the rule is one click away. */}
                <Link to="/policy" className="link-rule text-foreground">
                  {summary.verdict.rule}
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {summary.reasoning ? (
        <div className="log-row">
          <Eyebrow className="pt-1">in the model’s words</Eyebrow>
          <div className="flex max-w-[74ch] flex-col gap-1.5">
            {/* Verbatim, and marked as a quotation. The model wrote this;
                everything else on the panel is derived from structured
                fields, and the reader has to be able to tell which is
                which — so the model that wrote it is named underneath. */}
            <blockquote className="m-0 border-l pl-4 text-[15px] leading-relaxed text-muted-foreground italic">
              {summary.reasoning.text}
            </blockquote>
            {summary.reasoning.model ? (
              <span className="datum pl-4 text-[11px] text-muted-foreground">
                {summary.reasoning.model}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {summary.counterfactual ? (
        <div className="log-row">
          <Eyebrow className="pt-1">why, exactly</Eyebrow>
          <p className="max-w-[74ch] text-[15px] leading-relaxed">{summary.counterfactual}</p>
        </div>
      ) : null}
    </div>
  );
}

function protectedRun(action: NetworkAction | undefined): boolean {
  return action !== undefined && action !== NetworkAction.NONE;
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-3 border-t pt-4 pb-2">
      <Skeleton width="46%" />
      <Skeleton width="88%" />
      <Skeleton width="80%" />
      <Skeleton width="62%" />
    </div>
  );
}
