import { Link, useLocation } from 'react-router';

/** One line, one way back. Same typographic voice as everything else. */
export function NotFound() {
  const { pathname } = useLocation();

  return (
    <section className="log-row border-t pt-8">
      <span className="datum pt-1.5 text-xs text-muted-foreground">404</span>
      <div className="flex flex-col gap-3">
        <p className="text-xl leading-snug">
          No page at <span className="datum text-[17px]">{pathname}</span>.
        </p>
        <Link to="/" className="link-rule text-[15px] font-medium">
          ← Control Room
        </Link>
      </div>
    </section>
  );
}
