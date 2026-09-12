import { Drawer as Base } from '@base-ui/react/drawer';
import { XIcon } from '@phosphor-icons/react/X';
import { useRef } from 'react';

import { cn } from '@/lib/utils';

export type DrawerSide = 'right' | 'left';
export type DrawerSize = 'sm' | 'md' | 'lg';

const WIDTH: Record<DrawerSize, string> = {
  sm: '22rem',
  md: '28rem',
  lg: '40rem',
};

export interface DrawerProps {
  title: React.ReactNode;
  /** One short line under the title. Optional. */
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned under the scrolling body. Where a form's actions go. */
  footer?: React.ReactNode;
  /**
   * Opens the drawer when pressed — any button element. Leave it out and pass
   * `open` / `onOpenChange` to control the drawer from the outside instead.
   */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The edge it slides in from. */
  side?: DrawerSide;
  size?: DrawerSize;
  /**
   * Keep the contents mounted while closed, so state inside them — a
   * half-filled form — survives a stray click outside.
   */
  keepMounted?: boolean;
  /** Close on a press outside the panel. On by default. */
  dismissible?: boolean;
  /**
   * What gets focus on open. `first-field` (the default) focuses the first
   * input, select or textarea — or the panel, if there is none. `panel`
   * focuses the panel itself. Or pass a ref to focus something specific.
   */
  initialFocus?: 'first-field' | 'panel' | React.RefObject<HTMLElement | null>;
  /** Extra classes for the scrolling body. */
  bodyClassName?: string;
}

const FIELD = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)';

/**
 * A panel that slides in over the page from one edge.
 *
 * Built on Base UI's Drawer, which supplies what a hand-rolled one gets wrong:
 * focus trapped inside and returned to the trigger on close, Escape to close,
 * page scroll locked, the rest of the page inert to assistive technology, and
 * swipe-to-dismiss on touch. This file only decides how it looks.
 *
 * Same language as the rest of the product — paper, hairlines, no shadow —
 * so it reads as a sheet laid on the page rather than a floating card.
 *
 * The close button sits last in the DOM and is placed in the header visually,
 * so tabbing starts in the content rather than on the X.
 */
export function Drawer({
  title,
  description,
  children,
  footer,
  trigger,
  open,
  onOpenChange,
  side = 'right',
  size = 'md',
  keepMounted = false,
  dismissible = true,
  initialFocus = 'first-field',
  bodyClassName,
}: DrawerProps) {
  const fromRight = side === 'right';
  const popupRef = useRef<HTMLDivElement>(null);

  // Base UI's drawer focuses the panel by default, which suits a phone and not
  // a form on a desk. On touch the panel still gets it: focusing a field there
  // throws the keyboard up over the drawer before anyone has read it.
  const focusOnOpen = (openType: string): boolean | HTMLElement => {
    if (typeof initialFocus === 'object') return initialFocus.current ?? true;
    if (initialFocus === 'panel' || openType === 'touch') return true;
    return popupRef.current?.querySelector<HTMLElement>(FIELD) ?? true;
  };

  return (
    <Base.Root
      open={open}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
      swipeDirection={side}
      disablePointerDismissal={!dismissible}
    >
      {trigger ? <Base.Trigger render={trigger} /> : null}

      <Base.Portal keepMounted={keepMounted}>
        <Base.Backdrop
          className={cn(
            'fixed inset-0 z-40 bg-[color-mix(in_oklch,var(--foreground)_22%,transparent)]',
            // Fades with the swipe, then transitions in and out.
            'opacity-[calc(1_-_var(--drawer-swipe-progress,0))]',
            'transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
            'motion-reduce:transition-none',
          )}
        />

        <Base.Viewport className={cn('fixed inset-0 z-50 flex', fromRight ? 'justify-end' : 'justify-start')}>
          <Base.Popup
            ref={popupRef}
            initialFocus={focusOnOpen}
            className={cn(
              'relative flex h-full max-w-full flex-col bg-background text-foreground outline-none',
              fromRight ? 'border-l' : 'border-r',
              // Follows the finger while swiping; slides from its edge otherwise.
              '[transform:translateX(var(--drawer-swipe-movement-x,0px))]',
              fromRight
                ? 'data-[ending-style]:[transform:translateX(100%)] data-[starting-style]:[transform:translateX(100%)]'
                : 'data-[ending-style]:[transform:translateX(-100%)] data-[starting-style]:[transform:translateX(-100%)]',
              'transition-transform ease-[cubic-bezier(0.2,0.8,0.2,1)]',
              '[transition-duration:calc(240ms*var(--drawer-swipe-strength,1))]',
              'data-[swiping]:transition-none motion-reduce:transition-none',
            )}
            style={{ width: WIDTH[size] }}
          >
            <header className="flex flex-col gap-0.5 border-b py-3.5 pr-14 pl-5">
              <Base.Title className="m-0 text-[15px] leading-snug font-medium">{title}</Base.Title>
              {description ? (
                <Base.Description className="m-0 text-xs text-muted-foreground">
                  {description}
                </Base.Description>
              ) : null}
            </header>

            <Base.Content className={cn('scroll-area min-h-0 flex-1 px-5 py-4', bodyClassName)}>
              {children}
            </Base.Content>

            {footer ? (
              <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">
                {footer}
              </footer>
            ) : null}

            <Base.Close
              aria-label="Close"
              title="Close"
              className="btn-bare absolute top-2.5 right-3 flex size-8 items-center justify-center text-muted-foreground"
            >
              <XIcon size={16} aria-hidden="true" />
            </Base.Close>
          </Base.Popup>
        </Base.Viewport>
      </Base.Portal>
    </Base.Root>
  );
}

/** Any button inside a drawer that should close it — a Cancel in the footer, say. */
export const DrawerClose = Base.Close;
