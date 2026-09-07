import { Eyebrow } from '@/components/primitives';
import type { NetworkCallTrace } from '@/types';

/**
 * One CAMARA call, printed.
 *
 * The receipts: a real endpoint path, the body that went out, what Nokia sent
 * back, and how long it took. This is what separates a working integration
 * from a claim about one, so it is rendered as an instrument printout rather
 * than hidden behind an expander or prettified into a code editor.
 */
export function NetworkReceipt({ call }: { call: NetworkCallTrace }) {
  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="datum text-[13px]">
          <span className="text-muted-foreground">{call.api}</span> {call.operation}
        </span>
        {call.durationMs !== undefined ? (
          <span className="datum text-xs text-muted-foreground">
            {call.durationMs.toLocaleString('en-US')} ms
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Payload label="request" body={call.request} />
        <Payload label="response" body={call.response} />
      </div>
    </div>
  );
}

function Payload({ label, body }: { label: string; body?: Record<string, unknown> }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Eyebrow>{label}</Eyebrow>
      <pre className="datum m-0 overflow-x-auto border-l pt-1 pr-1 pb-2 pl-3 text-[11px] leading-relaxed text-muted-foreground">
        {body ? JSON.stringify(body, null, 2) : '—'}
      </pre>
    </div>
  );
}
