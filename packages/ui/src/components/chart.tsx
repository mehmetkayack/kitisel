import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode, RefObject } from 'react';
import { cn } from '../lib/cn';

export interface ChartPoint {
  /** Eksen ve ipucu etiketi (ör. biçimlenmiş tarih) */
  label: string;
  value: number;
}

interface ChartBaseProps {
  points: ChartPoint[];
  /** Grafiğin ne gösterdiği (başlık; tek seri: ayrı lejant yok) */
  title: ReactNode;
  /** Ekran okuyucu özeti, ör. "Son 28 günde 1.240 gösterim" */
  summary: string;
  formatValue: (n: number) => string;
  /** Tablo görünümü (erişilebilirlik): açılır/kapanır */
  tableLabel: ReactNode;
  columnLabel: ReactNode;
  valueLabel: ReactNode;
  height?: number;
  className?: string;
}

const PAD = { top: 12, right: 12, bottom: 28, left: 44 };

/** Temiz eksen üst sınırı: 1, 2, 2.5, 5 × 10^n */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * exp >= max) return step * exp;
  return 10 * exp;
}

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function ChartTable({ points, tableLabel, columnLabel, valueLabel, formatValue }: Pick<ChartBaseProps, 'points' | 'tableLabel' | 'columnLabel' | 'valueLabel' | 'formatValue'>) {
  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary">{tableLabel}</summary>
      <div className="max-h-64 overflow-y-auto rounded-control border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium text-ink-muted">
                {columnLabel}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium text-ink-muted">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={`${p.label}-${i}`} className="border-b border-border last:border-b-0">
                <td className="px-3 py-1.5 text-ink">{p.label}</td>
                <td className="px-3 py-1.5 text-right text-ink tabular-nums">{formatValue(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Tooltip({ x, width, label, value }: { x: number; width: number; label: string; value: string }) {
  // Kenarlarda taşmasın: kutu imlecin solunda/sağında kalır
  const left = Math.min(Math.max(x, 70), Math.max(70, width - 70));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 flex-col rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs shadow-card"
      style={{ left }}
    >
      <span className="font-semibold text-ink tabular-nums">{value}</span>
      <span className="text-ink-muted">{label}</span>
    </div>
  );
}

function YAxis({ ticks, y, width, format }: { ticks: number[]; y: (v: number) => number; width: number; format: (n: number) => string }) {
  return (
    <g aria-hidden>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} shapeRendering="crispEdges" />
          <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * Tek serili çizgi grafik (zaman içinde değişim): 2 px çizgi, %10 alan dolgusu, son noktada işaret.
 * İşaretçi ya da ok tuşlarıyla en yakın noktaya dikey imleç + ipucu. Tablo görünümü her zaman var.
 */
export function LineChart({ points, title, summary, formatValue, tableLabel, columnLabel, valueLabel, height = 200, className }: ChartBaseProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = points.length ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';
  const ticks = [0, max / 2, max];
  const labelIdx = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!points.length || !innerW) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - PAD.left) / innerW;
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(rel * (points.length - 1)))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!points.length) return;
    const cur = active ?? points.length - 1;
    if (e.key === 'ArrowLeft') setActive(Math.max(0, cur - 1));
    else if (e.key === 'ArrowRight') setActive(Math.min(points.length - 1, cur + 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(points.length - 1);
    else return;
    e.preventDefault();
  };
  const last = points.length - 1;
  const shown = active ?? null;

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <figcaption id={titleId} className="text-sm font-medium text-ink">
        {title}
      </figcaption>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-labelledby={titleId}
            aria-describedby={`${titleId}-summary`}
            tabIndex={0}
            className="touch-pan-y overflow-visible focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onPointerMove={pick}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(last >= 0 ? last : null)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          >
            <YAxis ticks={ticks} y={y} width={width} format={formatValue} />
            {area ? <path d={area} className="fill-primary/10" /> : null}
            {line ? <path d={line} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
            {labelIdx.map((i) => (
              <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-ink-muted text-[11px]" aria-hidden>
                {points[i]!.label}
              </text>
            ))}
            {shown !== null ? (
              <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-ink-muted" strokeWidth={1} aria-hidden />
            ) : null}
            {last >= 0 ? (
              <circle cx={x(shown ?? last)} cy={y(points[shown ?? last]!.value)} r={4} className="fill-primary stroke-surface" strokeWidth={2} aria-hidden />
            ) : null}
          </svg>
        ) : null}
        {shown !== null && points[shown] ? <Tooltip x={x(shown)} width={width} label={points[shown].label} value={formatValue(points[shown].value)} /> : null}
        <p id={`${titleId}-summary`} className="sr-only" aria-live="polite">
          {shown !== null && points[shown] ? `${points[shown].label}: ${formatValue(points[shown].value)}` : summary}
        </p>
      </div>
      <ChartTable points={points} tableLabel={tableLabel} columnLabel={columnLabel} valueLabel={valueLabel} formatValue={formatValue} />
    </figure>
  );
}

/**
 * Tek serili sütun grafik (az sayıda dönem): sütun en fazla 24 px, uç 4 px yuvarlak, taban düz.
 * Her sütun kendi ipucunu taşır (işaretçi ve klavye odağı); son sütunun değeri üstünde yazılı.
 */
export function ColumnChart({ points, title, summary, formatValue, tableLabel, columnLabel, valueLabel, height = 180, className, max: fixedMax }: ChartBaseProps & { max?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const max = fixedMax ?? niceMax(Math.max(0, ...points.map((p) => p.value)));
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = points.length ? innerW / points.length : 0;
  const barW = Math.min(24, Math.max(4, band * 0.6));
  const cx = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + innerH - (Math.min(v, max) / max) * innerH;
  const last = points.length - 1;
  const bar = (i: number, v: number) => {
    const top = y(v);
    const h = PAD.top + innerH - top;
    const r = Math.min(4, h, barW / 2);
    const x0 = cx(i) - barW / 2;
    // Üst köşeler yuvarlak, taban düz
    return `M${x0},${top + h}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${top + h}Z`;
  };

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <figcaption id={titleId} className="text-sm font-medium text-ink">
        {title}
      </figcaption>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 ? (
          <svg width={width} height={height} role="group" aria-labelledby={titleId} aria-describedby={`${titleId}-summary`} className="overflow-visible">
            <YAxis ticks={[0, max / 2, max]} y={y} width={width} format={formatValue} />
            {points.map((p, i) => (
              <g
                key={`${p.label}-${i}`}
                tabIndex={0}
                role="img"
                aria-label={`${p.label}: ${formatValue(p.value)}`}
                className="outline-none focus-visible:[&>path:first-of-type]:stroke-primary"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {/* İsabet alanı sütundan geniş: bandın tamamı */}
                <rect x={cx(i) - band / 2} y={PAD.top} width={band} height={innerH} fill="transparent" strokeWidth={2} />
                {p.value > 0 ? <path d={bar(i, p.value)} className={cn('fill-primary transition-opacity', active !== null && active !== i && 'opacity-70')} /> : null}
                {(points.length <= 8 || i === 0 || i === last) ? (
                  <text x={cx(i)} y={height - 8} textAnchor="middle" className="fill-ink-muted text-[11px]" aria-hidden>
                    {p.label}
                  </text>
                ) : null}
              </g>
            ))}
            {last >= 0 ? (
              <text x={cx(last)} y={y(points[last]!.value) - 6} textAnchor="middle" className="fill-ink text-xs font-semibold tabular-nums" aria-hidden>
                {formatValue(points[last]!.value)}
              </text>
            ) : null}
          </svg>
        ) : null}
        {active !== null && points[active] ? <Tooltip x={cx(active)} width={width} label={points[active].label} value={formatValue(points[active].value)} /> : null}
        <p id={`${titleId}-summary`} className="sr-only">
          {summary}
        </p>
      </div>
      <ChartTable points={points} tableLabel={tableLabel} columnLabel={columnLabel} valueLabel={valueLabel} formatValue={formatValue} />
    </figure>
  );
}
