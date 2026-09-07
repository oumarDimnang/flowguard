import { Link, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Glyph, Section, Status } from '@/components/primitives';
import { POLICY_RULES, POLICY_THRESHOLDS, THESIS_RULE, type PolicyRule } from '@/features/policy/rules';
import { cn } from '@/lib/utils';

/**
 * The complete decision logic, on one screen.
 *
 * The argument: a language model classifies how critical the job is; it never
 * decides what the network does. That second half is a pure function with eight
 * named rules, evaluated in order, exhaustively tested — and finite, which is
 * why it fits on a page. An agent that chooses its own actions has no
 * equivalent of this screen.
 *
 * Arriving with `?rule=…` lights the rule that fired for a given operation, so
 * a row in a decision trail leads straight to the branch that produced it.
 */
export function Policy() {
  const [params] = useSearchParams();
  const applied = params.get('rule') ?? undefined;
  const operationId = params.get('from') ?? undefined;

  return (
    <>
      <PageHeader
        trail={[{ label: 'FlowGuard', to: '/' }, { label: 'Policy' }]}
        title="The Policy"
        description="Every decision this system can make. The model classifies criticality; these rules map that classification to a network action. Evaluated in order — the first match wins."
        meta={
          <>
            8 rules · 1 disabled
            <br />
            pure function · no I/O
          </>
        }
      />

      {applied ? (
        <div className="log-row border-t border-b border-t-primary border-b-primary py-3">
          <Eyebrow className="pt-0.5">applied</Eyebrow>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <Status kind="filled" className="font-medium text-primary">
              {applied}
            </Status>
            <span className="text-muted-foreground">
              fired for{' '}
              {operationId ? (
                <Link to={`/operations/${operationId}`} className="datum text-foreground">
                  {operationId}
                </Link>
              ) : (
                'the operation you came from'
              )}
              .
            </span>
          </div>
        </div>
      ) : null}

      <Section title="Rules" meta="evaluation order" className="mt-6">
        <ol className="flex flex-col">
          {POLICY_RULES.map((rule, index) => (
            <RuleRow key={rule.id} rule={rule} index={index + 1} applied={applied === rule.id} />
          ))}
          <li className="border-t" />
        </ol>
      </Section>

      <Section title="Thresholds" meta="environment · changeable without a code edit" className="mt-12">
        <dl className="flex flex-col">
          {POLICY_THRESHOLDS.map((threshold) => (
            <div
              key={threshold.key}
              className="grid grid-cols-[minmax(0,20rem)_6rem_minmax(0,1fr)] items-baseline gap-x-4 border-t py-2.5"
            >
              <dt className="datum text-[13px]">{threshold.key}</dt>
              <dd className="datum m-0 text-[13px] font-medium">{threshold.value}</dd>
              <dd className="m-0 text-xs text-muted-foreground">{threshold.note}</dd>
            </div>
          ))}
          <div className="border-t" />
        </dl>
      </Section>
    </>
  );
}

function RuleRow({ rule, index, applied }: { rule: PolicyRule; index: number; applied: boolean }) {
  const isThesis = rule.id === THESIS_RULE;

  return (
    <li
      className={cn(
        'grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-4 border-t py-3',
        rule.disabled && 'text-muted-foreground',
        applied && 'border-t-primary',
      )}
    >
      <span className="datum pt-0.5 text-[13px] text-muted-foreground">
        {String(index).padStart(2, '0')}
      </span>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <span
            className={cn(
              'datum status-line text-[13px] font-medium',
              applied && 'text-primary',
              isThesis && !applied && 'text-foreground',
            )}
          >
            <Glyph kind={rule.disabled ? 'slash' : applied ? 'filled' : 'hollow'} />
            {rule.id}
          </span>

          <span className="datum text-[11px] tracking-[0.06em] text-muted-foreground">
            → {rule.action}
          </span>

          {rule.disabled ? (
            <span className="datum text-[11px] tracking-[0.06em] text-muted-foreground">
              disabled
            </span>
          ) : null}
        </div>

        <p className="max-w-[68ch] text-[13px]">{rule.when}</p>

        {/*
         * The thesis gets a pull-quote rather than a footnote. It is the single
         * rule separating this product from a congestion monitor, and someone
         * skimming the page should not be able to miss it.
         */}
        {isThesis ? (
          <p
            className={cn(
              'max-w-[52ch] border-l-2 pl-4 text-[17px] leading-snug',
              applied ? 'border-l-primary text-primary' : 'border-l-foreground',
            )}
          >
            Congestion alone is never a reason to act.
          </p>
        ) : null}

        {rule.note && !isThesis ? (
          <p className="max-w-[68ch] text-xs text-muted-foreground">{rule.note}</p>
        ) : null}
      </div>
    </li>
  );
}
