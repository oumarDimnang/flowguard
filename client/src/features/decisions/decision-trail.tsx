import { useState } from 'react';
import { Link } from 'react-router';

import { Glyph, Skeleton } from '@/components/primitives';
import { logTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DecisionStep, type DecisionRecord } from '@/types';
import { AssessmentDetail } from './assessment-detail';
import { summarise } from './decision-summary';
import { NetworkReceipt } from './network-receipt';

/** Steps that open by default — the judgement and anything that failed. */
const OPEN_BY_DEFAULT = new Set<DecisionStep>([
  DecisionStep.CRITICALITY_ASSESSED,
  DecisionStep.FAILED,
]);

export interface DecisionTrailProps {
  records: readonly DecisionRecord[];
  loading?: boolean;
}

/**
 * One operation's decision trail, oldest first.
 *
 * Read top to bottom it is the whole argument: the device was there, the
 * network was congested, the model judged the job, a rule mapped that judgement
 * to an action, the network was programmed, and it was given back. Every step
 * is present even when it carries no payload, because a gap in an audit trail
 * is itself information.
 */
export function DecisionTrail({ records, loading }: DecisionTrailProps) {
  if (loading && records.length === 0) return <TrailSkeleton />;

  if (records.length === 0) {
    return (
      <div className="log-row border-t border-b py-3">
        <span className="datum text-xs text-muted-foreground">—</span>
        <span className="text-muted-foreground">No records for this operation.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {records.map((record, index) => (
        <TrailStep key={record.idempotencyKey} record={record} index={index + 1} />
      ))}
      <div className="border-t" />
    </div>
  );
}

function TrailStep({ record, index }: { record: DecisionRecord; index: number }) {
  const expandable = hasDetail(record);
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(record.step));

  return (
    <section className="border-t py-3">
      <div className="log-row log-row-actionable">
        <span className="datum text-xs text-muted-foreground">{logTime(record.occurredAt)}</span>

        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4">
          <span className="datum status-line text-[13px] font-medium">
            <Glyph kind={record.step === DecisionStep.FAILED ? 'slash' : 'filled'} />
            <span
              className={cn(
                record.step === DecisionStep.RELEASED && 'text-primary',
                record.step === DecisionStep.FAILED && 'text-destructive',
              )}
            >
              {record.step}
            </span>
          </span>

          <span className="min-w-0 text-[13px] text-muted-foreground">{summarise(record)}</span>

          {/* The rule that fired, linked to the policy it came from. This is
              the field that makes the decision auditable rather than opaque. */}
          {record.rule ? (
            <Link
              to={`/policy?rule=${record.rule}&from=${record.operationId}`}
              className="datum text-[11px] tracking-[0.06em] text-muted-foreground hover:text-primary"
              title="See this rule in the policy"
            >
              rule {record.rule} ↗
            </Link>
          ) : null}
        </div>

        {expandable ? (
          <button type="button" className="btn-bare text-xs text-muted-foreground" onClick={() => setOpen((o) => !o)}>
            {open ? 'collapse' : 'expand'}
          </button>
        ) : (
          <span className="datum text-xs text-muted-foreground">
            {String(index).padStart(2, '0')}
          </span>
        )}
      </div>

      {expandable && open ? (
        <div className="log-row pt-4">
          <span />
          <div className="min-w-0">
            {record.step === DecisionStep.CRITICALITY_ASSESSED ? (
              <AssessmentDetail record={record} />
            ) : null}
            {record.networkCall ? <NetworkReceipt call={record.networkCall} /> : null}
            {record.step === DecisionStep.ALLOCATED ? <AllocationDetail record={record} /> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AllocationDetail({ record }: { record: DecisionRecord }) {
  return (
    <dl className="flex flex-col gap-1 text-[13px]">
      <Field label="QoD session" value={record.qodSessionId} />
      <Field label="Slice" value={record.sliceId} />
      <Field label="QoS status" value={record.qosStatus} />
      <Field label="Status info" value={record.qosStatusInfo} />
    </dl>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <dt className="w-[14ch] text-muted-foreground">{label}</dt>
      <dd className="datum m-0">{value}</dd>
    </div>
  );
}

function hasDetail(record: DecisionRecord): boolean {
  return (
    record.step === DecisionStep.CRITICALITY_ASSESSED ||
    record.networkCall !== undefined ||
    record.step === DecisionStep.ALLOCATED
  );
}

function TrailSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 7 }, (_, row) => (
        <div key={row} className="log-row border-t py-3.5">
          <Skeleton width="9ch" />
          <Skeleton width="40%" />
        </div>
      ))}
      <div className="border-t" />
    </div>
  );
}
