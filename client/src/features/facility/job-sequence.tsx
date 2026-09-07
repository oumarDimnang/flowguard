import { cn } from '@/lib/utils';
import { JOB_ABORTED, JOB_QUEUED, type FacilityJob } from '@/types';

/**
 * A job's physical sequence, as a ruled progress strip.
 *
 * Each step is a column with a hairline above it and a marker sitting on that
 * line. Reached steps take the ink rule and a filled marker; unreached steps
 * take the border rule and a hollow one — so progress is legible from the
 * rules alone, before any colour is involved.
 *
 * Driven entirely by the job's own `lifecycle`, so it renders a crane's eight
 * stations and a drone's six without knowing what either is. The gate step —
 * the twistlock, the pre-flight check — is the one that matters, and it takes
 * the accent and a label the others do not.
 *
 * Shared rather than duplicated per industry because it is the one part of the
 * panel that genuinely is generic: the specificity lives in the state names,
 * which the adapter supplies.
 */
export function JobSequence({ job }: { job: FacilityJob }) {
  const reachedIndex = job.lifecycle.indexOf(job.state);
  const aborted = job.state === JOB_ABORTED;
  const columns = job.lifecycle.length + 1;

  return (
    <ol
      className="datum grid gap-0 text-[11px] tracking-[0.06em]"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      <Step label={JOB_QUEUED} reached marker="filled" />

      {job.lifecycle.map((step, index) => {
        const reached = reachedIndex >= index;
        const holding = step === job.gateState && job.state === job.gateState;

        return (
          <Step
            key={step}
            label={holding ? `${step} · HOLD` : step}
            reached={reached && !aborted}
            current={holding}
            marker={aborted && index > reachedIndex ? 'slash' : reached ? 'filled' : 'hollow'}
            emphasised={index === job.lifecycle.length - 1 && reached}
          />
        );
      })}
    </ol>
  );
}

interface StepProps {
  label: string;
  reached: boolean;
  current?: boolean;
  marker: 'filled' | 'hollow' | 'slash';
  emphasised?: boolean;
}

function Step({ label, reached, current, marker, emphasised }: StepProps) {
  return (
    <li
      className={cn(
        'relative border-t pt-2.5 pr-2',
        reached ? 'border-t-foreground' : 'text-muted-foreground',
        current && 'font-medium text-primary',
        emphasised && 'font-medium',
      )}
    >
      {/* The marker straddles the rule rather than sitting under it — the strip
          reads as one continuous line with stations on it. */}
      <i
        aria-hidden="true"
        className={cn(
          'absolute -top-1 left-0 block size-2',
          marker === 'filled' && 'bg-current',
          marker === 'hollow' && 'box-border border border-current bg-background',
          marker === 'slash' && 'glyph-slash',
          current && 'animate-pulse',
        )}
      />
      {label}
    </li>
  );
}
