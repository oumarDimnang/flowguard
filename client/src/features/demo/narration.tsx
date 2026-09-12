import { Eyebrow, Slot } from '@/components/primitives';
import { cn } from '@/lib/utils';
import type { Beat } from './beats';

export interface Readout {
  label: string;
  value: string;
  /** Widest value the slot will ever hold, in characters. */
  ch: number;
  tone?: 'accent';
}

export interface NarrationProps {
  beat: Beat;
  index: number;
  count: number;
  readouts: readonly Readout[];
  /** Shown under the narration once the demo has played to the end. */
  coda?: React.ReactNode;
}

/**
 * What the viewer should take from this step, in one headline and a sentence.
 *
 * A polite live region, so the step's narration is announced as it changes —
 * the scene above it is a picture, and the narration is what a screen reader
 * gets instead.
 */
export function Narration({ beat, index, count, readouts, coda }: NarrationProps) {
  return (
    <footer className="grid shrink-0 grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-5 gap-y-3 border-t px-6 py-3 md:grid-cols-[3rem_minmax(0,1fr)_auto]">
      <div className="datum pt-0.5 text-[22px] leading-none font-medium text-muted-foreground">
        {String(index + 1).padStart(2, '0')}
        <span className="text-xs">/{count}</span>
      </div>

      <div className="min-w-0" aria-live="polite">
        {beat.tag ? <Eyebrow className="pb-0.5 text-destructive">{beat.tag}</Eyebrow> : null}
        <h2 className="text-[17px] leading-tight font-semibold">{beat.title}</h2>
        <p className="mt-1 max-w-[96ch] text-[13.5px] leading-snug text-muted-foreground">{beat.body}</p>
        {coda ? <div className="mt-1.5 text-[13px]">{coda}</div> : null}
      </div>

      <dl className="col-span-2 flex gap-6 md:col-span-1">
        {readouts.map((readout) => (
          <div key={readout.label} className="flex flex-col gap-1">
            <dt className="eyebrow">{readout.label}</dt>
            <dd
              className={cn(
                'datum m-0 text-[15px] leading-none',
                readout.tone === 'accent' && 'text-primary',
              )}
            >
              <Slot ch={readout.ch}>{readout.value}</Slot>
            </dd>
          </div>
        ))}
      </dl>
    </footer>
  );
}
