import { confidence, percent } from '@/lib/format';
import { DecisionStep, type DecisionRecord } from '@/types';

/**
 * One line describing what a decision record actually says.
 *
 * Every step carries a different payload, so a generic renderer would either
 * dump the whole object or show nothing useful. This maps each step to the
 * fields that matter for it, and is shared by the live feed and the trail so
 * the same record never reads two different ways on two screens.
 */
export function summarise(record: DecisionRecord): string {
  switch (record.step) {
    case DecisionStep.DEVICE_CHECKED:
      return record.deviceReachable
        ? 'device reachable'
        : 'device unreachable — allocation would be wasted';

    case DecisionStep.CONGESTION_CHECKED:
      return `congestion ${record.congestion ?? 'unknown'}`;

    case DecisionStep.CRITICALITY_ASSESSED: {
      const parts = [`${record.criticality ?? 'unknown'}`];
      if (record.criticalityConfidence !== undefined) {
        parts.push(`confidence ${confidence(record.criticalityConfidence)}`);
      }
      if (record.toolCalls?.length) {
        parts.push(`${record.toolCalls.length} tool call${record.toolCalls.length === 1 ? '' : 's'}`);
      }
      if (record.error) parts.push('fallback applied');
      return parts.join(' · ');
    }

    case DecisionStep.DECIDED:
      return `action ${record.action ?? 'NONE'}`;

    case DecisionStep.ALLOCATED:
      return record.sliceId
        ? `session ${short(record.qodSessionId)} · slice ${short(record.sliceId)}`
        : `session ${short(record.qodSessionId)}`;

    case DecisionStep.QOS_STATUS_CHANGED:
      return record.qosStatusInfo
        ? `${record.qosStatus ?? 'unknown'} · ${record.qosStatusInfo}`
        : `${record.qosStatus ?? 'unknown'}`;

    case DecisionStep.RELEASED:
      return 'connectivity released';

    case DecisionStep.FAILED:
      return record.error ?? 'workflow failed';

    default:
      return '';
  }
}

/** First segment of a UUID — enough to correlate, short enough for a column. */
function short(id: string | undefined): string {
  if (!id) return '—';
  return id.length > 8 ? id.slice(0, 8) : id;
}

export { short, percent };
