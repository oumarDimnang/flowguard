import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { Wordmark } from '@/components/brand/logo';
import { Eyebrow, ThemeToggler } from '@/components/primitives';
import { AgentLog } from '@/features/demo/agent-log';
import { beatStarts, frameAt, scriptFor, type Frame } from '@/features/demo/beats';
import { CraneScene } from '@/features/demo/crane-scene';
import { Narration, type Readout } from '@/features/demo/narration';
import { OperatorFeed } from '@/features/demo/operator-feed';
import { RECORDING } from '@/features/demo/recording';
import { RunTimeline } from '@/features/demo/run-timeline';
import { deriveSceneState } from '@/features/demo/scene-state';
import { StepStrip } from '@/features/demo/step-strip';
import {
  phaseAt,
  premiumHeldBy,
  spoken,
  stamp,
  stepOf,
  timelineOf,
  type MoveTimeline,
} from '@/features/demo/timeline';
import { usePlayback, usePrefersReducedMotion } from '@/features/demo/use-playback';
import { cn } from '@/lib/utils';
import { DecisionStep } from '@/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * /demo — FlowGuard on one screen, for anyone with the link.
 *
 * A replay of two recorded crane moves, preceded by one illustrated beat that
 * says what goes wrong without it. Public, and deliberately static: it makes
 * no API calls, so a viewer cannot start a workflow or spend network capacity,
 * and it plays the same whether or not the rest of the stack is running.
 *
 * Laid out for a laptop or a projector — everything at once, nothing below the
 * fold. Below the large breakpoint it stacks and scrolls instead of shrinking
 * the drawing past legibility.
 */
export function Demo() {
  const critical = useMemo(() => timelineOf(RECORDING.critical), []);
  const routine = useMemo(() => timelineOf(RECORDING.routine), []);
  const beats = useMemo(() => scriptFor(critical, routine), [critical, routine]);
  const starts = useMemo(() => beatStarts(beats), [beats]);
  const total = starts[starts.length - 1] + beats[beats.length - 1].ms;

  // `?step=4` opens on a step — for a presenter who wants to start mid-story.
  const [params] = useSearchParams();
  const requested = Number.parseInt(params.get('step') ?? '', 10);
  const initial =
    Number.isFinite(requested) && requested >= 1 && requested <= beats.length
      ? starts[requested - 1]
      : 0;

  const reduced = usePrefersReducedMotion();
  const playback = usePlayback(total, { autoplay: !reduced, initial });
  const { seek, play } = playback;
  const frame = frameAt(beats, starts, playback.position);

  // Stepping plays the step it lands on — a presenter pressing → wants the
  // next part of the story, not a frozen first frame of it. Space pauses.
  const goTo = useCallback(
    (index: number) => {
      seek(starts[Math.min(beats.length - 1, Math.max(0, index))]);
      if (!reduced) play();
    },
    [beats.length, play, reduced, seek, starts],
  );

  const next = () => {
    if (frame.index >= beats.length - 1) seek(total);
    else goTo(frame.index + 1);
  };

  // Back to the start of this step, or to the previous one if already there.
  const previous = () => goTo(frame.localMs > 1_500 ? frame.index : frame.index - 1);

  useKeyboard({ toggle: playback.toggle, next, previous, goTo, count: beats.length });

  const timeline = frame.beat.source === 'routine' ? routine : critical;
  const seconds = frame.beat.source === 'illustration' ? frame.localMs / 1000 : (frame.t ?? 0);
  const scene = deriveSceneState({
    source: frame.beat.source,
    seconds,
    timeline,
    earlier: frame.beat.source === 'critical' ? routine : undefined,
  });

  const craneState =
    frame.beat.source === 'illustration' ? 'HOISTING' : phaseAt(timeline, seconds).state;

  return (
    <main
      className={cn(
        'demo-page flex min-h-dvh flex-col bg-background lg:h-dvh lg:overflow-hidden',
        !playback.playing && 'demo-paused',
      )}
    >
      <TopBar
        playing={playback.playing}
        finished={playback.finished}
        onToggle={playback.toggle}
        onPrevious={previous}
        onNext={next}
      />

      <div className="flex shrink-0 items-end gap-6 px-6 pt-3">
        <StepStrip
          beats={beats}
          index={frame.index}
          local={frame.local}
          onSelect={goTo}
          className="min-w-0 flex-1"
        />
        <Clock frame={frame} />
      </div>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-x-6 gap-y-4 px-6 pt-3 pb-3 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,33%)]">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="relative min-h-0 flex-1 max-lg:h-[56vw]">
            <div className="absolute inset-0">
              <CraneScene
                state={scene}
                job={timeline.move.job}
                craneState={craneState}
                flows={frame.beat.flows}
                beatMs={frame.localMs}
              />
            </div>
          </div>

          <div className="flex h-[8.5rem] shrink-0 items-stretch gap-5 border-t pt-2.5">
            <figure className="m-0 flex h-full shrink-0 flex-col gap-1">
              <Eyebrow>Operator view · illustrated</Eyebrow>
              <div className="min-h-0 flex-1">
                <OperatorFeed
                  state={scene}
                  containerId={timeline.move.job.attributes.containerId}
                  imdg={timeline.move.job.attributes.imdgClass}
                  clock={feedClock(frame, scene.halted)}
                  seconds={seconds}
                />
              </div>
            </figure>
            <RunTimeline source={frame.beat.source} timeline={timeline} seconds={seconds} />
          </div>
        </div>

        <div className="flex min-h-0 flex-col lg:border-l lg:pl-6 max-lg:border-t max-lg:pt-3">
          <AgentLog beat={frame.beat} critical={critical} routine={routine} seconds={seconds} />
        </div>
      </section>

      <Narration
        beat={frame.beat}
        index={frame.index}
        count={beats.length}
        readouts={readoutsFor(frame, timeline, seconds)}
        coda={playback.finished ? <Coda /> : undefined}
      />
    </main>
  );
}

// ── Chrome ───────────────────────────────────────────────────────────

function TopBar({
  playing,
  finished,
  onToggle,
  onPrevious,
  onNext,
}: {
  playing: boolean;
  finished: boolean;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { identity } = useAuth();
  const captured = new Date(RECORDING.capturedAt);
  const site = RECORDING.critical.operation.site?.split(' — ').slice(0, 2).join(', ');

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b px-6">
      <Wordmark height={18} />
      <span className="eyebrow text-foreground">Demo</span>
      <span className="min-w-0 truncate text-[13px] max-md:hidden">
        Crane lift{site ? ` · ${site}` : ''}
        <span className="text-muted-foreground">
          {' '}
          · recorded {captured.getUTCDate()} {MONTHS[captured.getUTCMonth()]}{' '}
          {captured.getUTCFullYear()}
        </span>
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <button type="button" className="btn-line px-2.5" onClick={onPrevious} aria-label="Previous step" title="Previous step (←)">
          ‹
        </button>
        <button
          type="button"
          className="btn-line min-w-[5.5rem]"
          onClick={onToggle}
          title="Play or pause (space)"
        >
          {playing ? 'Pause' : finished ? 'Replay' : 'Play'}
        </button>
        <button type="button" className="btn-line px-2.5" onClick={onNext} aria-label="Next step" title="Next step (→)">
          ›
        </button>
      </div>

      <span className="datum text-[11px] text-muted-foreground max-xl:hidden">space · ← →</span>

      <ThemeToggler />

      <Link to={identity ? '/' : '/login'} className="link-rule text-[13px]">
        {identity ? 'Open FlowGuard' : 'Sign in'}
      </Link>
    </header>
  );
}

/** The recording's own clock, and how fast it is being played. */
function Clock({ frame }: { frame: Frame }) {
  if (frame.t === undefined) {
    return (
      <span className="datum shrink-0 pb-0.5 text-[11px] text-destructive">illustration</span>
    );
  }

  return (
    <span className="datum shrink-0 pb-0.5 text-[11px] text-muted-foreground" title="Seconds since the job was issued, in the recording">
      <span className="text-foreground">t+{frame.t.toFixed(2).padStart(5, '0')} s</span>
      {' · '}
      {frame.speed === undefined ? 'held' : `×${frame.speed.toFixed(2)}`}
    </span>
  );
}

function feedClock(frame: Frame, halted: boolean): string {
  if (frame.t !== undefined) return `t+${stamp(frame.t)}`;
  return halted ? 'FROZEN' : 'LIVE';
}

function readoutsFor(frame: Frame, timeline: MoveTimeline, seconds: number): Readout[] {
  if (frame.beat.source === 'illustration') {
    return [
      { label: 'crane stops', value: '—', ch: 3 },
      { label: 'decided at', value: '—', ch: 9 },
      { label: 'premium held', value: '—', ch: 6 },
    ];
  }

  const decided = stepOf(timeline, DecisionStep.DECIDED);
  const stops = timeline.move.transitions.filter(
    (change) => change.state === 'HELD' && Date.parse(change.at) - timeline.origin <= seconds * 1000,
  ).length;
  const held = premiumHeldBy(timeline, seconds);

  return [
    { label: 'crane stops', value: String(stops), ch: 3 },
    {
      label: 'decided at',
      value: decided && decided.at <= seconds ? `t+${stamp(decided.at)} s` : '—',
      ch: 9,
    },
    { label: 'premium held', value: spoken(held), ch: 6, tone: held > 0 ? 'accent' : undefined },
  ];
}

function Coda() {
  return (
    <span className="text-muted-foreground">
      That was a recording, replayed exactly.{' '}
      <Link to="/login" className="link-rule text-foreground">
        Sign in
      </Link>{' '}
      to run it live from the Control Room.
    </span>
  );
}

// ── Keys ─────────────────────────────────────────────────────────────

interface KeyHandlers {
  toggle: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  count: number;
}

/**
 * Presenter keys: space plays and pauses, the arrows step, 1–9 and 0 jump.
 *
 * Space is taken from the page even when a button has focus — otherwise the
 * focused step button would activate as well, and one keypress would seek and
 * toggle at once.
 *
 * The handlers change every frame (they read the playhead), so they are kept
 * in a ref and the listener is attached once, rather than re-attached sixty
 * times a second.
 */
function useKeyboard(handlers: KeyHandlers) {
  const latest = useRef(handlers);

  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const { toggle, next, previous, goTo, count } = latest.current;

      if (event.key === ' ' || event.key === 'k') {
        event.preventDefault();
        toggle();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
      } else if (event.key === 'Home') {
        event.preventDefault();
        goTo(0);
      } else if (/^[0-9]$/.test(event.key)) {
        const index = event.key === '0' ? 9 : Number(event.key) - 1;
        if (index < count) goTo(index);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
