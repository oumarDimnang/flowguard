import { useEffect, useRef, useState } from 'react';

import { api } from '@/api/endpoints';
import { useResource } from '@/hooks/use-resource';

/**
 * Runs a scripted scenario from the masthead.
 *
 * The scenarios are the reproducible path — `drone-contrast` is the pair the
 * whole thesis rests on, and `ambulance-telemedicine` is the one that shows
 * this is not a crane-only product. They deliberately do not appear in the
 * berth work queue, because they are not container moves; their results land
 * in Operations history.
 */
export function ScenarioRunner() {
  const scenarios = useResource((signal) => api.simulator.scenarios(signal), []);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  // Dismiss on outside click and on Escape. A menu that traps the pointer is
  // an unpleasant thing to discover while presenting.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = async (scenarioId: string) => {
    setRunning(scenarioId);
    try {
      await api.simulator.run(scenarioId);
      setOpen(false);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        className="btn-bare"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        Run scenario ▾
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-7 right-0 z-20 flex min-w-60 flex-col border-t border-b border-t-foreground border-b-foreground bg-background"
        >
          {(scenarios.data ?? []).map((scenario, index) => (
            <button
              key={scenario.id}
              type="button"
              role="menuitem"
              disabled={running !== null}
              className="btn-bare flex justify-between gap-4 py-2 text-left disabled:opacity-50"
              onClick={() => void run(scenario.id)}
              title={scenario.description}
              style={index > 0 ? { borderTop: '1px solid var(--border)' } : undefined}
            >
              <span>{scenario.id}</span>
              <span className="text-muted-foreground">
                {running === scenario.id ? 'starting…' : `${scenario.steps.length} events`}
              </span>
            </button>
          ))}

          {scenarios.data?.length === 0 ? (
            <span className="py-2 text-muted-foreground">no scenarios</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
