import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Button, Empty, Popconfirm, Segmented, Spin, Table, Tag, Tooltip } from "antd";
import { BarChart3, Image as ImageIcon, Mic, RefreshCw, Sparkles, Trash2, Type, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SectionPageLayout } from "@/components/layout";
import { toIntlLocale } from "@/i18n/languages";
import {
    clearUsageEvents,
    summarizeUsage,
    type UsageCapability,
    type UsageDailyPoint,
    type UsageDateRange,
    type UsageEvent,
    type UsageHeatmapCell,
    type UsageOrigin,
    type UsageSummary,
} from "@canvas/services/usage-meter";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "models" | "recent";

const HEATMAP_OPACITIES = [0.18, 0.29, 0.4, 0.52, 0.64, 0.76, 0.88];
const CAPABILITY_COLORS: Record<UsageCapability, string> = {
    text: "#1c1917",
    image: "#57534e",
    video: "#a8a29e",
    audio: "#d6d3d1",
};

function formatNumber(value: number, locale?: string) {
    return new Intl.NumberFormat(toIntlLocale(locale)).format(value);
}

function formatTokens(value: number, locale?: string) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (value >= 10_000) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}K`;
    return formatNumber(value, locale);
}

function capabilityIcon(capability: UsageCapability) {
    if (capability === "image") return ImageIcon;
    if (capability === "video") return Video;
    if (capability === "audio") return Mic;
    return Type;
}

function CapabilityTag({ capability, t }: { capability: UsageCapability; t: (key: string, opts?: Record<string, unknown>) => string }) {
    const color =
        capability === "text" ? "default" : capability === "image" ? "blue" : capability === "video" ? "purple" : "gold";
    return <Tag color={color} className="m-0 whitespace-nowrap">{t(`usage.capabilityShort.${capability}`)}</Tag>;
}

const PIE_COLORS = ["#1c1917", "#57534e", "#78716c", "#a8a29e", "#d6d3d1", "#b45309", "#92400e", "#44403c"];

type PieSlice = { key: string; label: string; value: number; color: string };

function polar(cx: number, cy: number, r: number, angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
    const large = end - start > 180 ? 1 : 0;
    const o1 = polar(cx, cy, outer, end);
    const o0 = polar(cx, cy, outer, start);
    const i1 = polar(cx, cy, inner, start);
    const i0 = polar(cx, cy, inner, end);
    return [`M ${o0.x} ${o0.y}`, `A ${outer} ${outer} 0 ${large} 1 ${o1.x} ${o1.y}`, `L ${i0.x} ${i0.y}`, `A ${inner} ${inner} 0 ${large} 0 ${i1.x} ${i1.y}`, "Z"].join(" ");
}

function UsagePieChart({
    slices,
    locale,
    emptyLabel,
    centerLabel,
}: {
    slices: PieSlice[];
    locale?: string;
    emptyLabel: string;
    centerLabel?: string;
}) {
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    if (!total) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyLabel} />;
    let angle = 0;
    const arcs = slices
        .filter((slice) => slice.value > 0)
        .map((slice) => {
            const sweep = (slice.value / total) * 360;
            const start = angle;
            const end = angle + Math.max(sweep, 0.01);
            angle = end;
            return { ...slice, start, end, percent: (slice.value / total) * 100 };
        });

    return (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="relative size-44 shrink-0">
                <svg viewBox="0 0 120 120" className="size-full">
                    {arcs.length === 1 ? (
                        <>
                            <circle cx="60" cy="60" r="48" fill={arcs[0].color} />
                            <circle cx="60" cy="60" r="28" className="fill-white dark:fill-stone-950" />
                        </>
                    ) : (
                        arcs.map((arc) => <path key={arc.key} d={donutPath(60, 60, 48, 28, arc.start, arc.end)} fill={arc.color} />)
                    )}
                </svg>
                {centerLabel ? (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                        <div className="text-[10px] text-stone-400">{centerLabel}</div>
                        <div className="text-sm font-semibold tabular-nums">{formatNumber(total, locale)}</div>
                    </div>
                ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
                {arcs.map((arc) => (
                    <div key={arc.key} className="flex items-center gap-2 text-sm">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: arc.color }} />
                        <span className="min-w-0 flex-1 truncate" title={arc.label}>
                            {arc.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-xs text-stone-500">
                            {formatNumber(arc.value, locale)} · {arc.percent.toFixed(1)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    detail,
    icon: Icon,
}: {
    label: string;
    value: string;
    detail: string;
    icon: typeof Sparkles;
}) {
    return (
        <div className="min-w-0 rounded-2xl border border-stone-200 bg-white/70 p-4 dark:border-stone-800 dark:bg-stone-950/40">
            <div className="flex items-center gap-2 text-xs text-stone-500">
                <Icon className="size-3.5" />
                <span>{label}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-stone-950 dark:text-stone-50">{value}</div>
            <div className="mt-1 text-xs text-stone-500">{detail}</div>
        </div>
    );
}

function Card({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
    return (
        <section className={cn("flex min-w-0 flex-col rounded-2xl border border-stone-200 p-4 dark:border-stone-800", className)}>
            <header className="mb-3 shrink-0">
                <h4 className="m-0 text-[13px] font-semibold text-stone-900 dark:text-stone-100">{title}</h4>
                {hint ? <p className="mt-1 mb-0 text-xs leading-relaxed text-stone-500">{hint}</p> : null}
            </header>
            {children}
        </section>
    );
}

/** Stacked daily bars (by capability) + token polyline. */
function DailyTrendChart({
    daily,
    locale,
    t,
}: {
    daily: UsageDailyPoint[];
    locale?: string;
    t: (key: string, opts?: Record<string, unknown>) => string;
}) {
    const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
    const maxCalls = Math.max(1, ...daily.map((row) => row.calls));
    const maxTokens = Math.max(1, ...daily.map((row) => row.totalTokens));
    if (!daily.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

    const points = daily.map((row, index) => {
        const x = daily.length <= 1 ? 50 : (index / (daily.length - 1)) * 100;
        const y = 100 - (row.totalTokens / maxTokens) * 100;
        return `${x},${y}`;
    });

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-stone-500">
                {(["text", "image", "video", "audio"] as const).map((capability) => (
                    <span key={capability} className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: CAPABILITY_COLORS[capability] }} />
                        {t(`usage.capability.${capability}`)}
                    </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-3 rounded bg-amber-600" />
                    {t("usage.charts.tokenCurve")}
                </span>
            </div>
            <div className="relative flex h-48 min-w-0">
                <div className="flex w-12 shrink-0 flex-col justify-between pb-5 text-right text-[10px] tabular-nums text-stone-400">
                    {[1, 0.5, 0].map((ratio) => (
                        <span key={ratio} className="pr-2">
                            {formatNumber(Math.round(maxCalls * ratio), locale)}
                        </span>
                    ))}
                </div>
                <div className="relative min-w-0 flex-1 overflow-x-auto">
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-5">
                        {[0, 1, 2].map((line) => (
                            <span key={line} className="block border-t border-dashed border-stone-200 dark:border-stone-800" />
                        ))}
                    </div>
                    <div
                        className="relative grid h-full items-end gap-1 px-1 pb-5"
                        style={{
                            gridTemplateColumns: `repeat(${daily.length}, minmax(10px, 1fr))`,
                            minWidth: `${Math.max(360, daily.length * 14)}px`,
                        }}
                    >
                        {daily.map((row, index) => {
                            const totalHeight = (row.calls / maxCalls) * 100;
                            const segments: Array<{ key: UsageCapability; value: number }> = [
                                { key: "text", value: row.textCalls },
                                { key: "image", value: row.imageCalls },
                                { key: "video", value: row.videoCalls },
                                { key: "audio", value: row.audioCalls },
                            ];
                            return (
                                <button
                                    key={row.day}
                                    type="button"
                                    className="group relative flex h-full min-w-0 items-end focus-visible:outline-none"
                                    onMouseEnter={(event) => {
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        setHover({ index, x: rect.left + rect.width / 2, y: rect.top });
                                    }}
                                    onMouseLeave={() => setHover(null)}
                                >
                                    <span
                                        className="flex w-full min-w-[6px] flex-col-reverse overflow-hidden rounded-t-[3px]"
                                        style={{ height: `${Math.max(row.calls > 0 ? 2 : 0, totalHeight)}%` }}
                                    >
                                        {segments.map((segment) =>
                                            segment.value > 0 ? (
                                                <span
                                                    key={segment.key}
                                                    className="block"
                                                    style={{
                                                        height: `${(segment.value / Math.max(1, row.calls)) * 100}%`,
                                                        backgroundColor: CAPABILITY_COLORS[segment.key],
                                                    }}
                                                />
                                            ) : null,
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                        <svg className="pointer-events-none absolute inset-x-1 top-0 bottom-5" viewBox="0 0 100 100" preserveAspectRatio="none">
                            <polyline
                                fill="none"
                                stroke="#d97706"
                                strokeWidth="1.4"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                vectorEffect="non-scaling-stroke"
                                points={points.join(" ")}
                            />
                        </svg>
                    </div>
                </div>
            </div>
            <div className={cn("ml-12 flex text-[9px] text-stone-400", daily.length < 2 ? "justify-center" : "justify-between")}>
                <span>{daily[0]?.day.slice(5)}</span>
                {daily.length > 2 ? <span>{daily[Math.floor(daily.length / 2)]?.day.slice(5)}</span> : null}
                {daily.length > 1 ? <span>{daily[daily.length - 1]?.day.slice(5)}</span> : null}
            </div>
            {hover ? (
                <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-stone-700 dark:bg-stone-900" style={{ left: hover.x, top: hover.y - 8 }}>
                    {(() => {
                        const row = daily[hover.index];
                        return (
                            <>
                                <div className="font-medium">{row.day}</div>
                                <div className="mt-0.5 tabular-nums text-stone-500">
                                    {t("usage.callsCount", { count: formatNumber(row.calls, locale) })} · {t("usage.tokensCount", { count: formatTokens(row.totalTokens, locale) })}
                                </div>
                            </>
                        );
                    })()}
                </div>
            ) : null}
        </div>
    );
}

function TokenComposition({ summary, locale, t }: { summary: UsageSummary; locale?: string; t: (key: string, opts?: Record<string, unknown>) => string }) {
    const total = Math.max(1, summary.tokenComposition.totalTokens || summary.tokenComposition.inputTokens + summary.tokenComposition.outputTokens + summary.tokenComposition.cacheReadTokens + summary.tokenComposition.cacheWriteTokens);
    const rows = [
        { id: "input", label: t("usage.charts.tokenInput"), value: summary.tokenComposition.inputTokens, color: "bg-stone-900 dark:bg-stone-100" },
        { id: "output", label: t("usage.charts.tokenOutput"), value: summary.tokenComposition.outputTokens, color: "bg-stone-700 dark:bg-stone-300" },
        { id: "cacheWrite", label: t("usage.charts.tokenCacheWrite"), value: summary.tokenComposition.cacheWriteTokens, color: "bg-stone-400" },
        { id: "cacheRead", label: t("usage.charts.tokenCacheRead"), value: summary.tokenComposition.cacheReadTokens, color: "bg-amber-600" },
    ];
    return (
        <div className="flex flex-1 flex-col justify-between gap-3">
            {rows.map((item) => {
                const percentage = (item.value / total) * 100;
                return (
                    <div key={item.id}>
                        <div className="mb-1 flex items-baseline gap-3 text-[13px]">
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            <span className="shrink-0 font-mono text-xs tabular-nums">{formatTokens(item.value, locale)}</span>
                            <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-stone-400">{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-900">
                            <div className={cn("h-full rounded-full transition-[width] duration-500", item.color)} style={{ width: `${Math.max(percentage, item.value > 0 ? 1.5 : 0)}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function UsageHeatmap({
    heatmap,
    t,
    locale,
}: {
    heatmap: UsageHeatmapCell[];
    t: (key: string, opts?: Record<string, unknown>) => string;
    locale?: string;
}) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const [hover, setHover] = useState<{ weekday: number; hour: number; weight: number; calls: number; tokens: number; x: number; y: number; width: number; height: number; containerWidth: number } | null>(null);
    const matrix = useMemo(() => {
        const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ weight: 0, calls: 0, totalTokens: 0 })));
        for (const cell of heatmap) cells[cell.weekday][cell.hour] = cell;
        return cells;
    }, [heatmap]);
    const max = Math.max(1, ...matrix.flatMap((row) => row.map((cell) => cell.weight)));
    const weekdayLabels = [
        t("usage.charts.weekdayMon"),
        t("usage.charts.weekdayTue"),
        t("usage.charts.weekdayWed"),
        t("usage.charts.weekdayThu"),
        t("usage.charts.weekdayFri"),
        t("usage.charts.weekdaySat"),
        t("usage.charts.weekdaySun"),
    ];
    const busiestHour = useMemo(() => {
        const totals = Array.from({ length: 24 }, (_, hour) => matrix.reduce((sum, row) => sum + row[hour].weight, 0));
        const peak = Math.max(...totals);
        return peak > 0 ? totals.indexOf(peak) : null;
    }, [matrix]);

    return (
        <div ref={wrapperRef} className="relative flex min-h-0 flex-1 flex-col gap-2">
            <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-1.5 gap-y-0.5" style={{ gridTemplateRows: "auto repeat(7, minmax(1rem, 1fr))" }} onMouseLeave={() => setHover(null)}>
                <span />
                <div className="mb-0.5 grid text-[10px] leading-none text-stone-400" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                    {[0, 6, 12, 18].map((hour) => (
                        <span key={hour} className="tabular-nums" style={{ gridColumn: `${hour + 1} / span 2` }}>
                            {hour}
                        </span>
                    ))}
                    <span className="text-right tabular-nums" style={{ gridColumn: "23 / span 2" }}>
                        23
                    </span>
                </div>
                {matrix.map((row, weekday) => (
                    <div key={weekday} className="contents">
                        <span className="flex items-center pr-0.5 text-[10px] leading-none text-stone-400">{weekday % 2 === 0 ? weekdayLabels[weekday] : ""}</span>
                        <div className="grid h-full min-h-4 gap-0.5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                            {row.map((cell, hour) => {
                                const intensity =
                                    cell.weight > 0
                                        ? Math.min(HEATMAP_OPACITIES.length - 1, Math.max(0, Math.ceil(Math.sqrt(cell.weight / max) * HEATMAP_OPACITIES.length) - 1))
                                        : null;
                                return (
                                    <div
                                        key={hour}
                                        role="img"
                                        aria-label={`${weekdayLabels[weekday]} ${String(hour).padStart(2, "0")}:00`}
                                        className={cn("h-full w-full rounded-full", intensity === null && "bg-stone-100 ring-1 ring-inset ring-stone-200 dark:bg-stone-900 dark:ring-stone-800")}
                                        style={intensity === null ? undefined : { backgroundColor: `rgb(28 25 23 / ${HEATMAP_OPACITIES[intensity]})` }}
                                        onMouseEnter={(event) => {
                                            const wrapper = wrapperRef.current;
                                            if (!wrapper) return;
                                            const cellBox = event.currentTarget.getBoundingClientRect();
                                            const wrapperBox = wrapper.getBoundingClientRect();
                                            setHover({
                                                weekday,
                                                hour,
                                                weight: cell.weight,
                                                calls: cell.calls,
                                                tokens: cell.totalTokens,
                                                x: cellBox.left - wrapperBox.left,
                                                y: cellBox.top - wrapperBox.top,
                                                width: cellBox.width,
                                                height: cellBox.height,
                                                containerWidth: wrapperBox.width,
                                            });
                                        }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-end gap-1.5 text-[10px] text-stone-400">
                <span>{t("usage.charts.heatmapLess")}</span>
                <span className="size-2.5 rounded-full bg-stone-100 ring-1 ring-inset ring-stone-200 dark:bg-stone-900 dark:ring-stone-800" />
                {HEATMAP_OPACITIES.map((opacity) => (
                    <span key={opacity} className="size-2.5 rounded-full" style={{ backgroundColor: `rgb(28 25 23 / ${opacity})` }} />
                ))}
                <span>{t("usage.charts.heatmapMore")}</span>
            </div>
            {busiestHour !== null ? <div className="text-[10px] text-stone-400">{t("usage.charts.heatmapPeakHint", { hour: String(busiestHour).padStart(2, "0") })}</div> : null}
            {hover ? (
                <>
                    <span aria-hidden className="pointer-events-none absolute rounded-full ring-2 ring-stone-900/30 dark:ring-stone-100/30" style={{ left: hover.x - 1, top: hover.y - 1, width: hover.width + 2, height: hover.height + 2 }} />
                    <div
                        role="tooltip"
                        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-stone-700 dark:bg-stone-900"
                        style={{ left: Math.min(Math.max(hover.x + hover.width / 2, 56), Math.max(56, hover.containerWidth - 56)), top: hover.y - 6 }}
                    >
                        <div className="font-medium">
                            {weekdayLabels[hover.weekday]} {String(hover.hour).padStart(2, "0")}:00
                        </div>
                        <div className="mt-0.5 text-right font-mono tabular-nums text-stone-500">
                            {t("usage.callsCount", { count: formatNumber(hover.calls, locale) })}
                            {hover.tokens ? ` · ${formatTokens(hover.tokens, locale)} tokens` : ""}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}

function HourlyCurve({ hourly, locale, t }: { hourly: UsageSummary["hourly"]; locale?: string; t: (key: string, opts?: Record<string, unknown>) => string }) {
    const max = Math.max(1, ...hourly.map((row) => row.weight));
    const points = hourly.map((row, index) => {
        const x = (index / 23) * 100;
        const y = 100 - (row.weight / max) * 100;
        return `${x},${y}`;
    });
    const area = `0,100 ${points.join(" ")} 100,100`;
    return (
        <div className="space-y-2">
            <svg viewBox="0 0 100 42" className="h-36 w-full" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="usage-hourly-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1c1917" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#1c1917" stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                <polygon points={area} fill="url(#usage-hourly-fill)" />
                <polyline fill="none" stroke="#1c1917" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={points.join(" ")} className="dark:stroke-stone-100" />
            </svg>
            <div className="flex justify-between text-[10px] tabular-nums text-stone-400">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
            </div>
            <div className="text-[11px] text-stone-500">
                {t("usage.charts.hourlyHint", {
                    peak: String(hourly.reduce((best, row) => (row.weight > best.weight ? row : best), hourly[0]).hour).padStart(2, "0"),
                    calls: formatNumber(hourly.reduce((sum, row) => sum + row.calls, 0), locale),
                })}
            </div>
        </div>
    );
}

function CapabilityBars({ summary, t, locale }: { summary: UsageSummary; t: (key: string, opts?: Record<string, unknown>) => string; locale?: string }) {
    const rows = (["text", "image", "video", "audio"] as const).map((capability) => ({ capability, ...summary.byCapability[capability] }));
    const max = Math.max(1, ...rows.map((row) => row.calls));
    return (
        <div className="space-y-3">
            {rows.map((row) => {
                const Icon = capabilityIcon(row.capability);
                const width = `${Math.max(row.calls ? 6 : 0, Math.round((row.calls / max) * 100))}%`;
                return (
                    <div key={row.capability} className="min-w-0">
                        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-2 text-stone-700 dark:text-stone-200">
                                <Icon className="size-3.5 opacity-70" />
                                <span>{t(`usage.capability.${row.capability}`)}</span>
                            </div>
                            <div className="tabular-nums text-xs text-stone-500">
                                {t("usage.callsCount", { count: formatNumber(row.calls, locale) })}
                                {row.capability === "text" && row.totalTokens ? ` · ${t("usage.tokensCount", { count: formatTokens(row.totalTokens, locale) })}` : null}
                                {row.capability !== "text" && row.units ? ` · ${t(`usage.units.${row.capability}`, { count: formatNumber(row.units, locale) })}` : null}
                            </div>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-900">
                            <div className="h-full rounded-full" style={{ width, backgroundColor: CAPABILITY_COLORS[row.capability] }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function UsagePage() {
    const { message } = App.useApp();
    const { t, i18n } = useTranslation();
    const [range, setRange] = useState<UsageDateRange>("30d");
    const [tab, setTab] = useState<TabKey>("overview");
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<UsageSummary | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setSummary(await summarizeUsage(range));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("usage.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [message, range, t]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const locale = i18n.resolvedLanguage;
    const text = summary?.byCapability.text;
    const image = summary?.byCapability.image;
    const video = summary?.byCapability.video;
    const audio = summary?.byCapability.audio;

    const capabilityPie = useMemo<PieSlice[]>(() => {
        if (!summary) return [];
        return (["text", "image", "video", "audio"] as const).map((capability, index) => ({
            key: capability,
            label: t(`usage.capability.${capability}`),
            value: summary.byCapability[capability].calls,
            color: PIE_COLORS[index % PIE_COLORS.length],
        }));
    }, [summary, t]);

    const modelPie = useMemo<PieSlice[]>(() => {
        if (!summary) return [];
        const top = summary.byModel.slice(0, 7);
        const rest = summary.byModel.slice(7).reduce((sum, row) => sum + row.calls, 0);
        const slices = top.map((row, index) => ({
            key: `${row.capability}-${row.model}`,
            label: `${row.model} (${t(`usage.capabilityShort.${row.capability}`)})`,
            value: row.calls,
            color: PIE_COLORS[index % PIE_COLORS.length],
        }));
        if (rest > 0) {
            slices.push({
                key: "other-models",
                label: t("usage.charts.otherModels"),
                value: rest,
                color: PIE_COLORS[7],
            });
        }
        return slices;
    }, [summary, t]);

    const recentColumns = useMemo(
        () => [
            {
                title: t("usage.columns.time"),
                dataIndex: "createdAt",
                key: "createdAt",
                width: 168,
                render: (value: number) => new Date(value).toLocaleString(toIntlLocale(locale), { hour12: false }),
            },
            {
                title: t("usage.columns.capability"),
                dataIndex: "capability",
                key: "capability",
                width: 120,
                render: (value: UsageCapability) => <CapabilityTag capability={value} t={t} />,
            },
            {
                title: t("usage.columns.model"),
                dataIndex: "model",
                key: "model",
                ellipsis: true,
            },
            {
                title: t("usage.columns.meter"),
                key: "meter",
                width: 140,
                render: (_: unknown, row: UsageEvent) => {
                    if (row.capability === "text") {
                        const tokens = row.totalTokens || 0;
                        return tokens ? `${formatTokens(tokens, locale)}${row.tokensEstimated ? ` · ${t("usage.estimated")}` : ""}` : "—";
                    }
                    if (row.units == null) return "—";
                    return t(`usage.units.${row.capability}`, { count: formatNumber(row.units, locale) });
                },
            },
            {
                title: t("usage.columns.status"),
                dataIndex: "status",
                key: "status",
                width: 88,
                render: (value: UsageEvent["status"]) => <Tag color={value === "success" ? "green" : "red"}>{t(`usage.status.${value}`)}</Tag>,
            },
        ],
        [locale, t],
    );

    return (
        <SectionPageLayout>
            <SectionPageLayout.Title>{t("usage.title")}</SectionPageLayout.Title>
            <SectionPageLayout.Actions>
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                        value={range}
                        onChange={(value) => setRange(value as UsageDateRange)}
                        options={[
                            { label: t("usage.range.7d"), value: "7d" },
                            { label: t("usage.range.30d"), value: "30d" },
                            { label: t("usage.range.90d"), value: "90d" },
                            { label: t("usage.range.all"), value: "all" },
                        ]}
                    />
                    <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void refresh()} loading={loading}>
                        {t("usage.refresh")}
                    </Button>
                    <Popconfirm
                        title={t("usage.clearConfirm")}
                        okText={t("common.confirm")}
                        cancelText={t("common.cancel")}
                        onConfirm={async () => {
                            await clearUsageEvents();
                            message.success(t("usage.cleared"));
                            await refresh();
                        }}
                    >
                        <Button danger icon={<Trash2 className="size-3.5" />}>
                            {t("usage.clear")}
                        </Button>
                    </Popconfirm>
                </div>
            </SectionPageLayout.Actions>
            <SectionPageLayout.Content>
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="m-0 text-sm text-stone-500">{t("usage.subtitle")}</p>
                        {summary ? (
                            <Tooltip title={t("usage.storageHint")}>
                                <Tag className="m-0">{t(`usage.storage.${summary.storage}`)}</Tag>
                            </Tooltip>
                        ) : null}
                    </div>
                    <Segmented
                        value={tab}
                        onChange={(value) => setTab(value as TabKey)}
                        options={[
                            { label: t("usage.tabs.overview"), value: "overview" },
                            { label: t("usage.tabs.models"), value: "models" },
                            { label: t("usage.tabs.recent"), value: "recent" },
                        ]}
                    />

                    {loading && !summary ? (
                        <div className="flex min-h-64 items-center justify-center">
                            <Spin />
                        </div>
                    ) : !summary || summary.totalCalls === 0 ? (
                        <Empty description={t("usage.empty")} />
                    ) : tab === "overview" ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <StatCard
                                    icon={Sparkles}
                                    label={t("usage.stats.totalCalls")}
                                    value={formatNumber(summary.totalCalls, locale)}
                                    detail={t("usage.stats.successFailed", {
                                        success: formatNumber(summary.successCalls, locale),
                                        failed: formatNumber(summary.failedCalls, locale),
                                    })}
                                />
                                <StatCard
                                    icon={Type}
                                    label={t("usage.stats.textTokens")}
                                    value={formatTokens(text?.totalTokens || 0, locale)}
                                    detail={t("usage.stats.ioTokens", {
                                        input: formatTokens(text?.inputTokens || 0, locale),
                                        output: formatTokens(text?.outputTokens || 0, locale),
                                    })}
                                />
                                <StatCard
                                    icon={ImageIcon}
                                    label={t("usage.stats.images")}
                                    value={formatNumber(image?.units || 0, locale)}
                                    detail={t("usage.callsCount", { count: formatNumber(image?.calls || 0, locale) })}
                                />
                                <StatCard
                                    icon={BarChart3}
                                    label={t("usage.stats.av")}
                                    value={`${formatNumber(video?.units || 0, locale)}s / ${formatNumber(audio?.units || 0, locale)}`}
                                    detail={t("usage.stats.avDetail", {
                                        video: formatNumber(video?.calls || 0, locale),
                                        audio: formatNumber(audio?.calls || 0, locale),
                                    })}
                                />
                            </div>

                            <Card title={t("usage.charts.dailyTrend")} hint={t("usage.charts.dailyTrendHint")}>
                                <DailyTrendChart daily={summary.daily} locale={locale} t={t} />
                            </Card>

                            <div className="grid items-stretch gap-4 lg:grid-cols-2">
                                <Card title={t("usage.charts.tokenComposition")} hint={t("usage.charts.tokenCompositionHint")}>
                                    <TokenComposition summary={summary} locale={locale} t={t} />
                                </Card>
                                <Card title={t("usage.charts.activityHeatmap")} hint={t("usage.charts.heatmapHint")} className="min-h-[280px]">
                                    <UsageHeatmap heatmap={summary.heatmap} t={t} locale={locale} />
                                </Card>
                            </div>

                            <div className="grid items-stretch gap-4 lg:grid-cols-2">
                                <Card title={t("usage.charts.hourlyCurve")} hint={t("usage.charts.hourlyCurveHint")}>
                                    <HourlyCurve hourly={summary.hourly} locale={locale} t={t} />
                                </Card>
                                <Card title={t("usage.capabilityTitle")}>
                                    <CapabilityBars summary={summary} t={t} locale={locale} />
                                    {summary.byOrigin.length ? (
                                        <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-900">
                                            <div className="mb-2 text-xs font-medium text-stone-500">{t("usage.charts.byOrigin")}</div>
                                            <div className="flex flex-wrap gap-2">
                                                {summary.byOrigin.map((row) => (
                                                    <Tag key={row.origin} className="m-0">
                                                        {t(`usage.origin.${row.origin as UsageOrigin}`, { defaultValue: row.origin })} · {formatNumber(row.calls, locale)}
                                                    </Tag>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </Card>
                            </div>

                            <div className="grid items-stretch gap-4 lg:grid-cols-2">
                                <Card title={t("usage.charts.capabilityPie")} hint={t("usage.charts.capabilityPieHint")}>
                                    <UsagePieChart slices={capabilityPie} locale={locale} emptyLabel={t("usage.empty")} centerLabel={t("usage.columns.calls")} />
                                </Card>
                                <Card title={t("usage.charts.modelPie")} hint={t("usage.charts.modelPieHint")}>
                                    <UsagePieChart slices={modelPie} locale={locale} emptyLabel={t("usage.empty")} centerLabel={t("usage.columns.calls")} />
                                </Card>
                            </div>
                        </div>
                    ) : tab === "models" ? (
                        <div className="space-y-4">
                            <div className="grid items-stretch gap-4 lg:grid-cols-2">
                                <Card title={t("usage.charts.capabilityPie")} hint={t("usage.charts.capabilityPieHint")}>
                                    <UsagePieChart slices={capabilityPie} locale={locale} emptyLabel={t("usage.empty")} centerLabel={t("usage.columns.calls")} />
                                </Card>
                                <Card title={t("usage.charts.modelPie")} hint={t("usage.charts.modelPieHint")}>
                                    <UsagePieChart slices={modelPie} locale={locale} emptyLabel={t("usage.empty")} centerLabel={t("usage.columns.calls")} />
                                </Card>
                            </div>
                            <div className="overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
                                <Table
                                    rowKey={(row) => `${row.capability}-${row.model}`}
                                    pagination={{ pageSize: 12, hideOnSinglePage: true }}
                                    dataSource={summary.byModel}
                                    columns={[
                                        {
                                            title: t("usage.columns.capability"),
                                            dataIndex: "capability",
                                            width: 120,
                                            render: (value: UsageCapability) => <CapabilityTag capability={value} t={t} />,
                                        },
                                        { title: t("usage.columns.model"), dataIndex: "model", ellipsis: true },
                                        {
                                            title: t("usage.columns.calls"),
                                            dataIndex: "calls",
                                            width: 100,
                                            render: (value: number) => formatNumber(value, locale),
                                        },
                                        {
                                            title: t("usage.columns.tokens"),
                                            dataIndex: "totalTokens",
                                            width: 120,
                                            render: (value: number) => (value ? formatTokens(value, locale) : "—"),
                                        },
                                        {
                                            title: t("usage.columns.units"),
                                            dataIndex: "units",
                                            width: 120,
                                            render: (value: number, row) => (value ? t(`usage.units.${row.capability}`, { count: formatNumber(value, locale) }) : "—"),
                                        },
                                    ]}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
                            <Table rowKey="id" pagination={{ pageSize: 15, hideOnSinglePage: true }} dataSource={summary.recent} columns={recentColumns} />
                        </div>
                    )}
                </div>
            </SectionPageLayout.Content>
        </SectionPageLayout>
    );
}
