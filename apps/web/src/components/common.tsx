import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Funnel,
  Info,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import * as React from 'react';
import type { PaginationMeta } from '@hireflow/shared';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tooltip,
} from './ui';

// ── Page header ─────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {breadcrumb && <div className="mb-2 text-sm text-muted-foreground">{breadcrumb}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Empty / error / loading states ──────────────────────────────────────────

export function EmptyState({
  icon: Icon = Search,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-6" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message =
    error instanceof Error ? error.message : 'Something went wrong while loading this page.';
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center',
        className,
      )}
    >
      <AlertTriangle className="mb-3 size-8 text-destructive" />
      <h3 className="font-semibold">Couldn’t load this</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

export function PageLoader() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

// ── Search / filters / pagination ───────────────────────────────────────────

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  delayMs = 300,
  className,
  label = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delayMs?: number;
  className?: string;
  label?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const debounced = useDebounce(draft, delayMs);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    setDraft(value);
  }, [value]);
  React.useEffect(() => {
    if (debounced !== value) onChangeRef.current(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
      />
      {draft && (
        <button
          type="button"
          onClick={() => setDraft('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export interface FilterGroup {
  key: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

/** Multi-select filter popover; values are keyed by group. */
export function FilterPanel({
  groups,
  values,
  onChange,
}: {
  groups: FilterGroup[];
  values: Record<string, string[]>;
  onChange: (key: string, values: string[]) => void;
}) {
  const active = Object.values(values).reduce((sum, v) => sum + v.length, 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Funnel /> Filters
          {active > 0 && <Badge className="ml-1 px-1.5">{active}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          {groups.map((group) => (
            <fieldset key={group.key} className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </legend>
              {group.options.map((option) => {
                const id = `filter-${group.key}-${option.value}`;
                const checked = values[group.key]?.includes(option.value) ?? false;
                return (
                  <div key={option.value} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(state) => {
                        const current = values[group.key] ?? [];
                        onChange(
                          group.key,
                          state
                            ? [...current, option.value]
                            : current.filter((v) => v !== option.value),
                        );
                      }}
                    />
                    <Label htmlFor={id} className="font-normal">
                      {option.label}
                    </Label>
                  </div>
                );
              })}
            </fieldset>
          ))}
          {active > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => groups.forEach((g) => onChange(g.key, []))}
            >
              Clear all filters
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Pagination({
  pagination,
  onPageChange,
  className,
}: {
  pagination: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (!pagination || pagination.total === 0) return null;
  const { page, pageSize, total, totalPages } = pagination;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-between gap-4 pt-4 text-sm', className)}
    >
      <p className="text-muted-foreground">
        Showing{' '}
        <span className="font-medium text-foreground">
          {from}–{to}
        </span>{' '}
        of <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft /> Prev
        </Button>
        <span className="text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

// ── Stats ───────────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-5 shadow-xs', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── AI transparency ─────────────────────────────────────────────────────────

export function AIDisclaimer({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-2 rounded-lg border border-primary/20 bg-accent/50 p-3 text-xs text-accent-foreground',
        className,
      )}
      role="note"
    >
      <Info className="mt-0.5 size-4 shrink-0" />
      <p>
        {compact
          ? 'AI scores are decision support and require human review.'
          : 'AI recommendations are decision support only and require human review. Scores use job-relevant data (skills, experience, education, relevance) and never protected characteristics. No candidate is rejected automatically.'}
      </p>
    </div>
  );
}

export function AIBadge({
  provider,
  className,
}: {
  provider: string | null | undefined;
  className?: string;
}) {
  if (!provider) return null;
  const heuristic = provider === 'heuristic';
  return (
    <Tooltip
      content={
        heuristic
          ? 'Generated by the offline heuristic provider (no LLM key configured).'
          : `Generated by ${provider}`
      }
    >
      <Badge
        variant={heuristic ? 'warning' : 'default'}
        className={cn('cursor-default', className)}
      >
        <Sparkles /> {heuristic ? 'Heuristic AI' : 'AI'}
      </Badge>
    </Tooltip>
  );
}

// ── Detail list ─────────────────────────────────────────────────────────────

export function DetailItem({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}
