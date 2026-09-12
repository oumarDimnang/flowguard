import { Select as Base } from '@base-ui/react/select';
import { CaretDownIcon } from '@phosphor-icons/react/CaretDown';

import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** A muted second part, after the label. */
  hint?: string;
  disabled?: boolean;
}

/**
 * - `field`: an underlined form control, the same shape as a text field.
 * - `inline`: sits in a table row or a toolbar; the underline appears on hover.
 * - `quiet`: small muted text with a caret, for chrome like the sidebar.
 */
export type SelectVariant = 'field' | 'inline' | 'quiet';

export interface SelectProps<T extends string = string> {
  /** The chosen value. Empty string or undefined shows the placeholder. */
  value: T | '' | undefined;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  variant?: SelectVariant;
  disabled?: boolean;
  /** Draws the error state. Pair it with a message the trigger is described by. */
  invalid?: boolean;
  /** Put on the trigger, so a `<label htmlFor>` can name it. */
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  title?: string;
  className?: string;
}

const TRIGGER: Record<SelectVariant, string> = {
  field:
    'datum w-full border-b pb-1 text-[14px] focus-visible:border-b-primary data-[popup-open]:border-b-primary',
  inline:
    'w-full border-b border-b-transparent text-[13px] hover:border-b-border focus-visible:border-b-primary data-[popup-open]:border-b-primary',
  quiet: 'max-w-full text-xs text-muted-foreground hover:text-foreground data-[popup-open]:text-foreground',
};

/**
 * A select that looks like the rest of the product.
 *
 * The native `<select>` opens an operating-system list — white in dark mode,
 * the platform's own font and highlight — which is the one control on the page
 * the design language could not reach. This one is built on Base UI's Select,
 * so it keeps what the native control got right: arrow keys, typeahead, Enter
 * and Escape, and a proper listbox for screen readers.
 *
 * The list opens below the trigger rather than over it, and marks the chosen
 * option with the same filled square every other choice in the app uses.
 */
export function Select<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder,
  variant = 'field',
  disabled,
  invalid,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  title,
  className,
}: SelectProps<T>) {
  const chosen = value === '' || value === undefined ? null : value;

  return (
    <Base.Root<T>
      value={chosen}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      items={options.map((option) => ({ value: option.value, label: option.label }))}
      disabled={disabled}
    >
      <Base.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        title={title}
        className={cn(
          'group flex min-w-0 cursor-pointer items-center justify-between gap-2 bg-transparent text-left outline-none',
          'disabled:cursor-not-allowed disabled:text-muted-foreground data-[disabled]:cursor-not-allowed',
          TRIGGER[variant],
          invalid && (variant === 'quiet' ? 'text-destructive' : 'border-b-destructive'),
          className,
        )}
      >
        <Base.Value
          placeholder={placeholder}
          className="min-w-0 truncate data-[placeholder]:text-muted-foreground"
        />
        <Base.Icon className="flex shrink-0 text-muted-foreground transition-transform duration-150 group-data-[popup-open]:rotate-180 motion-reduce:transition-none">
          <CaretDownIcon size={variant === 'quiet' ? 11 : 12} aria-hidden="true" />
        </Base.Icon>
      </Base.Trigger>

      <Base.Portal>
        <Base.Positioner
          alignItemWithTrigger={false}
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-[60] outline-none"
        >
          <Base.Popup
            className={cn(
              'max-h-[min(var(--available-height),18rem)] min-w-[max(var(--anchor-width),11rem)] overflow-y-auto',
              'border bg-background py-1 text-[13px] text-foreground outline-none',
              'shadow-[0_10px_28px_-14px_color-mix(in_oklch,var(--foreground)_45%,transparent)]',
              'origin-[var(--transform-origin)] transition-[opacity,transform] duration-100',
              'data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0',
              'motion-reduce:transition-none',
            )}
          >
            <Base.List>
              {options.map((option) => (
                <Base.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  disabled={option.disabled}
                  className={cn(
                    'grid cursor-default grid-cols-[0.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2.5 px-3 py-1.5 outline-none select-none',
                    'data-[highlighted]:bg-muted data-[selected]:text-primary',
                    'data-[disabled]:cursor-not-allowed data-[disabled]:text-muted-foreground',
                  )}
                >
                  {/* Explicit content: left empty, Base UI draws a ✔️ emoji here. */}
                  <Base.ItemIndicator className="flex self-center">
                    <span className="block size-2 bg-primary" />
                  </Base.ItemIndicator>
                  <Base.ItemText className="col-start-2 min-w-0 truncate">{option.label}</Base.ItemText>
                  {option.hint ? (
                    <span className="datum col-start-3 text-[11px] text-muted-foreground">
                      {option.hint}
                    </span>
                  ) : null}
                </Base.Item>
              ))}
            </Base.List>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
