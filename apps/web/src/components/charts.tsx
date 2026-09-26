import { Table2, ChartColumn } from 'lucide-react';
import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui';

/**
 * Chart primitives. Conventions (see DECISIONS/ADR on charts): every chart here is a single
 * series, so one hue (--chart-1) carries it and the title names it (no legend box); magnitude
 * ramps use lightness steps of the same hue; grid/axes are recessive; text uses text tokens;
 * each chart has a hover tooltip and a table view so values are never color- or hover-only.
 */

const AXIS = { fontSize: 12, fill: 'var(--muted-foreground)' };
const SERIES = 'var(--chart-1)';

export interface ChartDatum {
  label: string;
  value: number;
  /** Optional secondary line shown in tooltip and table (e.g. average score). */
  detail?: string;
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value?: number; payload?: ChartDatum }>; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{item.payload?.label ?? label}</p>
      <p className="mt-0.5 text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{item.value}</span> {unit}
      </p>
      {item.payload?.detail && <p className="text-muted-foreground">{item.payload.detail}</p>}
    </div>
  );
}

function DataTable({ data, unit, labelHeader }: { data: ChartDatum[]; unit: string; labelHeader: string }) {
  const hasDetail = data.some((d) => d.detail);
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 font-medium">{labelHeader}</th>
            <th className="py-2 text-right font-medium">{unit}</th>
            {hasDetail && <th className="py-2 text-right font-medium">Detail</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-b last:border-0">
              <td className="py-1.5">{d.label}</td>
              <td className="py-1.5 text-right tabular-nums">{d.value}</td>
              {hasDetail && <td className="py-1.5 text-right text-muted-foreground">{d.detail ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({
  title,
  description,
  data,
  unit,
  labelHeader = 'Label',
  children,
  className,
  empty = 'No data yet',
}: {
  title: string;
  description?: string;
  data: ChartDatum[];
  unit: string;
  labelHeader?: string;
  children: React.ReactNode;
  className?: string;
  empty?: string;
}) {
  const [asTable, setAsTable] = React.useState(false);
  const hasData = data.some((d) => d.value > 0);
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {hasData && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAsTable((v) => !v)}
            aria-label={asTable ? `Show ${title} as chart` : `Show ${title} as table`}
            aria-pressed={asTable}
          >
            {asTable ? <ChartColumn /> : <Table2 />}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {!hasData ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">{empty}</div>
        ) : asTable ? (
          <DataTable data={data} unit={unit} labelHeader={labelHeader} />
        ) : (
          <div className="h-56" role="img" aria-label={`${title} chart. Use the table toggle for exact values.`}>
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Single-series trend (area with 2px line and hover crosshair). */
export function TrendChart({ data, unit }: { data: ChartDatum[]; unit: string }) {
  const gradientId = React.useId().replace(/:/g, '');
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.25} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <RechartsTooltip cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }} content={<ChartTooltip unit={unit} />} />
        <Area type="monotone" dataKey="value" stroke={SERIES} strokeWidth={2} fill={`url(#${gradientId})`} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Vertical bars, one hue; optional per-bar lightness ramp for ordered magnitude buckets. */
export function ColumnChart({ data, unit, ramp = false }: { data: ChartDatum[]; unit: string; ramp?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <RechartsTooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={<ChartTooltip unit={unit} />} />
        <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={48}>
          {ramp && data.map((d, i) => <Cell key={d.label} fillOpacity={0.35 + (0.65 * (i + 1)) / data.length} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranked bars (labels on the left) for categories with long names. */
export function RankedBarChart({ data, unit }: { data: ChartDatum[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap="24%">
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={130} />
        <RechartsTooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={<ChartTooltip unit={unit} />} />
        <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Hiring funnel as proportional bars with stage-to-stage conversion (HTML, not a chart lib). */
export function FunnelBars({ stages }: { stages: Array<{ stage: string; count: number; conversion: number | null }> }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ol className="space-y-2.5" aria-label="Hiring funnel">
      {stages.map((s) => (
        <li key={s.stage} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{s.stage}</span>
          <div className="h-6 overflow-hidden rounded-md bg-muted">
            <div className="h-full rounded-md" style={{ width: `${Math.max(2, (s.count / max) * 100)}%`, background: SERIES }} />
          </div>
          <span className="w-24 text-right tabular-nums">
            <span className="font-semibold">{s.count}</span>
            {s.conversion !== null && <span className="ml-1.5 text-xs text-muted-foreground">({s.conversion}%)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
