import { Wordmark } from '@/components/brand/logo';
import { Page } from '@/components/primitives';

export interface AuthFrameProps {
  heading: string;
  children: React.ReactNode;
  /** Under the form, above the fold line. */
  footer?: React.ReactNode;
  /** Right-hand column, desktop only. Context, never controls. */
  aside?: React.ReactNode;
}

/**
 * The sign-in frame.
 *
 * A ruled form on warm paper rather than a centred card with a drop shadow —
 * the rest of the product has no cards and no shadows, and the first screen
 * should not be the exception.
 */
export function AuthFrame({ heading, children, footer, aside }: AuthFrameProps) {
  return (
    <main className="min-h-screen">
      <Page className="grid min-h-screen grid-cols-1 items-center lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-24">
        <div className="flex flex-col gap-8 py-16">
          <Wordmark height={22} />

          <div className="flex flex-col gap-6 border-t pt-8">
            <h1 className="text-xl font-medium">{heading}</h1>
            {children}
          </div>

          {footer ? (
            <footer className="flex items-baseline gap-2 border-t pt-4 text-[13px] text-muted-foreground">
              {footer}
            </footer>
          ) : null}
        </div>

        {aside ? <aside className="hidden flex-col gap-4 border-l pl-16 lg:flex">{aside}</aside> : null}
      </Page>
    </main>
  );
}
