import type { ContainerAttributes } from '@/types';

/**
 * Display formatting.
 *
 * Kept out of components so every screen renders the same value identically —
 * a weight shown two ways on two pages makes a reader wonder which is right.
 */

const EN_DASH = '—';

/** `40,100 kg`. Thousands separated so tonnage is scannable at a glance. */
export function weight(kg: number): string {
  return `${kg.toLocaleString('en-US')} kg`;
}

/** `40.1 t`. Used where the column is too narrow for kilogrammes. */
export function tonnes(kg: number): string {
  return `${(Math.round(kg / 100) / 10).toFixed(1)} t`;
}

/** `09:42:31.204` — the log clock. Milliseconds matter when ordering a trail. */
export function logTime(iso: string | undefined): string {
  if (!iso) return EN_DASH;

  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return EN_DASH;

  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  const ss = String(at.getSeconds()).padStart(2, '0');
  const ms = String(at.getMilliseconds()).padStart(3, '0');

  return `${hh}:${mm}:${ss}.${ms}`;
}

/** `02:14:07` — the coarser clock, for tables where milliseconds are noise. */
export function clock(iso: string | undefined): string {
  return logTime(iso).slice(0, 8);
}

/** `3m 04s`. Seconds are zero-padded so durations align in a column. */
export function duration(fromIso?: string, toIso?: string): string {
  if (!fromIso || !toIso) return EN_DASH;

  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return EN_DASH;

  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** `71.4%`, or `0%` on an empty denominator rather than `NaN`. */
export function percent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return EN_DASH;
  return `${value}%`;
}

/**
 * `IMDG 3 · over walkway`, or an em dash when the box is unremarkable.
 *
 * These are the attributes that actually drive the criticality judgement, so
 * they are always visible on the row rather than hidden behind an expander.
 */
export function containerFlags(container: ContainerAttributes): string {
  const flags: string[] = [];

  if (container.imdgClass) flags.push(`IMDG ${container.imdgClass}`);
  if (container.reefer) flags.push('reefer');
  if (container.twinLift) flags.push('twin-lift');
  if (container.overWalkway) flags.push('over walkway');

  return flags.length > 0 ? flags.join(' · ') : EN_DASH;
}

/** `BAY 22 ROW 04 TIER 82 → YARD A-12-3` */
export function route(from: string, to: string): string {
  return `${from} → ${to}`;
}

/** Confidence as a two-decimal figure: `0.94`. */
export function confidence(value: number | undefined): string {
  return value === undefined ? EN_DASH : value.toFixed(2);
}

export { EN_DASH };
