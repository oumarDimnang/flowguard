import type { CongestionLevel, Operation } from '@/types';

/**
 * The most recent congestion reading per device.
 *
 * Operations arrive newest first, so the first sighting of a device is its
 * latest. Devices never decided on do not appear — there is no reading for
 * them, and a row would be an invented measurement.
 */
export function congestionByDevice(
  operations: readonly Operation[],
): { deviceId: string; level: CongestionLevel; at: string }[] {
  const seen = new Map<string, { level: CongestionLevel; at: string }>();

  for (const operation of operations) {
    if (operation.congestion && !seen.has(operation.deviceId)) {
      seen.set(operation.deviceId, { level: operation.congestion, at: operation.startedAt });
    }
  }

  return [...seen.entries()]
    .map(([deviceId, reading]) => ({ deviceId, ...reading }))
    .sort((a, b) => a.deviceId.localeCompare(b.deviceId));
}

/** Middle value of an ascending list. Undefined when empty. */
export function median(ascending: readonly number[]): number | undefined {
  if (ascending.length === 0) return undefined;
  const middle = Math.floor(ascending.length / 2);
  return ascending.length % 2 === 1
    ? ascending[middle]
    : Math.round((ascending[middle - 1] + ascending[middle]) / 2);
}

/** `42.9` — a share as a one-decimal percentage, 0 on an empty denominator. */
export function share(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}
