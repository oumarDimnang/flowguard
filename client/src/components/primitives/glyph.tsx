import { cn } from '@/lib/utils';

/**
 * Status shapes.
 *
 * Three, and only three — the vocabulary is deliberately tiny so a reader
 * learns it once and then reads it everywhere without a legend.
 */
export type GlyphKind =
  /** Active, healthy, present, reached. */
  | 'filled'
  /** Pending, idle, not yet reached. */
  | 'hollow'
  /** Stopped, stale, disconnected, skipped. */
  | 'slash';

export interface GlyphProps {
  kind: GlyphKind;
  className?: string;
}

/**
 * An 8px status marker that inherits colour from its line.
 *
 * Status is never communicated by colour alone. Assume the projector washes
 * out hue and that someone in the room cannot separate clay from grey — the
 * shape has to carry the meaning by itself, with the label beside it doing the
 * rest.
 */
export function Glyph({ kind, className }: GlyphProps) {
  return <i aria-hidden="true" className={cn('glyph', `glyph-${kind}`, className)} />;
}

export interface StatusProps {
  kind: GlyphKind;
  children: React.ReactNode;
  className?: string;
}

/** A glyph and its label, kept on one line. */
export function Status({ kind, children, className }: StatusProps) {
  return (
    <span className={cn('status-line', className)}>
      <Glyph kind={kind} />
      {children}
    </span>
  );
}
