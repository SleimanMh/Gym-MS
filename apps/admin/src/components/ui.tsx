import type { ButtonHTMLAttributes, ComponentProps, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Minimal primitives in the shadcn/ui style. When the shadcn CLI is added (packages/ui),
 * these are replaced by the generated components with the same names and props.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "bg-surface text-fg ring-1 ring-inset ring-border hover:bg-sunken",
  ghost: "text-muted hover:bg-sunken hover:text-fg",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "transition-subtle inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] bg-surface p-5 shadow-[0_1px_2px_rgba(18,18,24,0.04)]", className)} {...props} />;
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-fg">
      {children}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-surface px-3 text-base placeholder:text-faint focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn("h-10 w-full rounded-xl border border-border bg-surface px-3 text-base focus:border-accent", className)}
      {...props}
    />
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-muted ring-border",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  accent: "bg-accent-soft text-accent ring-accent/20",
};

/** Status chip: a dot + label, so state never relies on colour alone. */
export function Badge({ tone = "neutral", children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Pages follow one pattern: title (+ one line of context) and the main action on the end side. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

/** Heading for a block inside a card, with an optional action or link on the end side. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/** Initials in a neutral circle (member photos arrive later). */
export function Avatar({ first, last, size = "md" }: { first: string; last: string; size?: "sm" | "md" | "lg" }) {
  const dim = { sm: "size-8 text-[11px]", md: "size-9 text-xs", lg: "size-16 text-xl" }[size];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-deep", dim)}
      aria-hidden
    >
      {(first[0] ?? "").toUpperCase()}
      {(last[0] ?? "").toUpperCase()}
    </span>
  );
}

/** Link tabs (state lives in the URL, so every tab is shareable and works without JS). */
export function Tabs({ items }: { items: { href: string; label: ReactNode; active: boolean; count?: number }[] }) {
  return (
    <nav className="mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1 [scrollbar-width:none]" aria-label="Sections">
      {items.map((it) => (
        <a
          key={it.href}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cn(
            "transition-subtle flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium",
            it.active ? "bg-ink text-white" : "text-muted hover:bg-sunken hover:text-fg",
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", it.active ? "bg-white/15 text-white" : "bg-sunken text-muted")}>
              {it.count}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
}

/**
 * Booked vs capacity — the number a gym looks at all day. Accent while there is room,
 * amber when full; the label carries the numbers so colour is never the only signal.
 */
export function FillMeter({
  booked,
  capacity,
  label,
  className,
}: {
  booked: number;
  capacity: number;
  label?: ReactNode;
  className?: string;
}) {
  const pct = capacity ? Math.min(100, Math.round((booked / capacity) * 100)) : 0;
  const full = booked >= capacity;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={booked}
        aria-label={typeof label === "string" ? label : undefined}
      >
        <div className={cn("h-full rounded-full", full ? "bg-warning" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
      {label !== undefined && <span className={cn("shrink-0 text-xs tabular-nums", full ? "text-warning" : "text-muted")}>{label}</span>}
    </div>
  );
}

/** Alert line inside a page (errors from the API, translated). */
export function Notice({ tone = "danger", children }: { tone?: "danger" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "mb-4 rounded-lg px-3 py-2 text-sm",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
      )}
    >
      {children}
    </p>
  );
}
