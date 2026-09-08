import { Link } from 'react-router';

import { Wordmark } from '@/components/brand/logo';
import { Page } from '@/components/primitives';

export interface AuthFrameProps {
  /** One line under the wordmark saying what this screen does. */
  heading: string;
  children: React.ReactNode;
  /** The other door: "New here? Create an organization". */
  footer: { prompt: string; label: string; to: string };
  /** Right-hand column, desktop only. Context, never controls. */
  aside: React.ReactNode;
}

/**
 * The frame both doors share.
 *
 * A ruled form on warm paper rather than a centred card with a drop shadow —
 * the rest of the product has no cards and no shadows, and the first screen
 * should not be the exception. Login and registration use the identical grid
 * so switching between them changes the fields and nothing else.
 */
export function AuthFrame({ heading, children, footer, aside }: AuthFrameProps) {
  return (
    <main className="min-h-screen">
      <Page className="grid min-h-screen grid-cols-1 items-center lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-24">
        <div className="flex flex-col gap-8 py-16">
          <header className="flex flex-col gap-2">
            <Wordmark height={22} />
            <p className="text-xs text-muted-foreground">
              per-lift connectivity decisions, on the record
            </p>
          </header>

          <div className="flex flex-col gap-6 border-t pt-8">
            <h1 className="text-xl font-medium">{heading}</h1>
            {children}
          </div>

          <footer className="flex items-baseline gap-2 border-t pt-4 text-[13px] text-muted-foreground">
            <span>{footer.prompt}</span>
            <Link to={footer.to} className="link-rule text-foreground">
              {footer.label}
            </Link>
          </footer>
        </div>

        <aside className="hidden flex-col gap-4 border-l pl-16 lg:flex">{aside}</aside>
      </Page>
    </main>
  );
}
