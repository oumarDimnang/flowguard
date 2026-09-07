import { Link } from 'react-router';

import { Eyebrow } from '@/components/primitives';

export interface PageHeaderProps {
  /** Breadcrumb trail, rendered into the eyebrow. Last entry is the page. */
  trail?: { label: string; to?: string }[];
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned context — counts, scope, the berth this data belongs to. */
  meta?: React.ReactNode;
}

/**
 * The header every page except the Control Room uses.
 *
 * Shared so the eyebrow, heading and description sit at identical heights from
 * page to page — navigating between them should feel like turning a page in one
 * document rather than loading four different screens.
 */
export function PageHeader({ trail, title, description, meta }: PageHeaderProps) {
  return (
    <header className="grid grid-cols-1 items-end gap-8 pb-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex flex-col gap-1.5">
        {trail?.length ? (
          <Eyebrow>
            {trail.map((crumb, index) => (
              <span key={crumb.label}>
                {index > 0 ? <span className="mx-1.5">/</span> : null}
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
              </span>
            ))}
          </Eyebrow>
        ) : null}

        <h1>{title}</h1>

        {description ? (
          <p className="max-w-[72ch] text-[15px] text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {meta ? (
        <div className="datum text-xs text-muted-foreground lg:text-right">{meta}</div>
      ) : null}
    </header>
  );
}
