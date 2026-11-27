import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CdnTrafficPoint } from "@canvas/lib/object-storage/cdn-traffic";
import { cn } from "@canvas/lib/utils";

export type CdnChartLine = {
    key: string;
    label: string;
    color: string;
    points: CdnTrafficPoint[];
};

type Props = {
    lines: CdnChartLine[];
    className?: string;
    emptyLabel: string;
};

function formatTraffic(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[unit]}`;
}

/** Straight polyline — cubic smoothing overshoots on traffic spikes and hides later segments. */
function linePath(coords: Array<{ x: number; y: number }>) {
    if (!coords.length) return "";
    return coords
        .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(" ");
}

export function CdnTrafficChart({ lines, className, emptyLabel }: Props) {
    const { t } = useTranslation();
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [hidden, setHidden] = useState<Record<string, boolean>>({});

    const visibleLines = useMemo(
        () => lines.filter((line) => line.points.length > 0 && !hidden[line.key]),
        [hidden, lines],
    );

    const timeline = useMemo(() => {
        const set = new Set<string>();
        for (const line of lines) {
            for (const point of line.points) if (point.time) set.add(point.time);
        }
        return [...set].sort();
    }, [lines]);

    const width = 960;
    const height = 360;
    const pad = { top: 28, right: 24, bottom: 44, left: 72 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const { mapped, maxBytes, yTicks, xLabels } = useMemo(() => {
        const values = visibleLines.flatMap((line) => line.points.map((point) => point.bytes || 0));
        const max = Math.max(...values, 1);
        const mappedLines = visibleLines.map((line) => {
            const byTime = new Map(line.points.map((point) => [point.time, point.bytes]));
            const coords = timeline.map((time, index) => {
                const bytes = byTime.get(time) || 0;
                const x = pad.left + (timeline.length <= 1 ? innerW / 2 : (index / (timeline.length - 1)) * innerW);
                const y = pad.top + innerH - (bytes / max) * innerH;
                return { x, y, time, bytes };
            });
            const path = linePath(coords);
            const area =
                coords.length > 0
                    ? `${path} L${coords.at(-1)!.x.toFixed(2)} ${(pad.top + innerH).toFixed(2)} L${coords[0].x.toFixed(2)} ${(pad.top + innerH).toFixed(2)} Z`
                    : "";
            return { ...line, coords, path, area };
        });
        const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
            y: pad.top + innerH * (1 - ratio),
            label: formatTraffic(max * ratio),
        }));
        return {
            mapped: mappedLines,
            maxBytes: max,
            yTicks: ticks,
            xLabels: pickXLabels(timeline),
        };
    }, [innerH, innerW, timeline, visibleLines]);

    if (!timeline.length || !lines.some((line) => line.points.length)) {
        return (
            <div
                className={cn(
                    "flex h-[360px] items-center justify-center rounded-2xl border border-dashed border-stone-300/80 text-sm text-stone-500 dark:border-stone-700",
                    className,
                )}
            >
                {emptyLabel}
            </div>
        );
    }

    const hoverX =
        hoverIndex == null || !timeline.length
            ? null
            : pad.left + (timeline.length <= 1 ? innerW / 2 : (hoverIndex / (timeline.length - 1)) * innerW);

    return (
        <div
            className={cn(
                "relative overflow-hidden rounded-2xl border border-stone-200/80 bg-gradient-to-b from-white to-stone-50/80 dark:border-stone-700/80 dark:from-stone-950 dark:to-stone-900/80",
                className,
            )}
        >
            <div className="flex flex-wrap items-center justify-center gap-4 border-b border-stone-200/70 px-4 py-3 dark:border-stone-800">
                {lines.map((line) => {
                    const off = hidden[line.key];
                    return (
                        <button
                            key={line.key}
                            type="button"
                            className={cn(
                                "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs transition",
                                off ? "opacity-40" : "opacity-100 hover:bg-stone-100 dark:hover:bg-stone-800",
                            )}
                            onClick={() => setHidden((prev) => ({ ...prev, [line.key]: !prev[line.key] }))}
                        >
                            <span className="size-2.5 rounded-full" style={{ background: line.color }} />
                            <span className="text-stone-600 dark:text-stone-300">{line.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="relative px-2 pb-2 pt-1">
                <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
                    <defs>
                        {mapped.map((line) => (
                            <linearGradient key={`g-${line.key}`} id={`cdn-fill-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={line.color} stopOpacity="0.18" />
                                <stop offset="100%" stopColor={line.color} stopOpacity="0" />
                            </linearGradient>
                        ))}
                    </defs>

                    {yTicks.map((tick) => (
                        <g key={tick.y}>
                            <line
                                x1={pad.left}
                                x2={width - pad.right}
                                y1={tick.y}
                                y2={tick.y}
                                className="stroke-stone-200/90 dark:stroke-stone-800"
                                strokeDasharray="4 4"
                            />
                            <text x={pad.left - 10} y={tick.y + 3.5} textAnchor="end" className="fill-stone-400 text-[10px]">
                                {tick.label}
                            </text>
                        </g>
                    ))}

                    {mapped.map((line, lineIndex) => (
                        <g key={line.key}>
                            {lineIndex === 0 && line.area ? <path d={line.area} fill={`url(#cdn-fill-${line.key})`} /> : null}
                            <path
                                d={line.path}
                                fill="none"
                                stroke={line.color}
                                strokeWidth={lineIndex === 0 ? 2.4 : 1.8}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                pathLength={1}
                                className="cdn-line-draw"
                                style={{ animationDelay: `${lineIndex * 70}ms` }}
                            />
                            {line.coords.map((point, index) => {
                                const active = hoverIndex === index;
                                const sparse = timeline.length > 60;
                                const showDot = active || (!sparse && (timeline.length <= 36 || index % Math.ceil(timeline.length / 24) === 0));
                                if (!showDot) return null;
                                return (
                                    <circle
                                        key={`${line.key}-${point.time}`}
                                        cx={point.x}
                                        cy={point.y}
                                        r={active ? 4.5 : 2.2}
                                        fill={active ? line.color : "white"}
                                        stroke={line.color}
                                        strokeWidth={active ? 2 : 1.4}
                                        className="dark:fill-stone-950"
                                    />
                                );
                            })}
                        </g>
                    ))}

                    {hoverX != null ? (
                        <line
                            x1={hoverX}
                            x2={hoverX}
                            y1={pad.top}
                            y2={pad.top + innerH}
                            className="stroke-stone-400/70 dark:stroke-stone-500/70"
                            strokeDasharray="3 3"
                        />
                    ) : null}

                    {xLabels.map((label) => {
                        const index = timeline.indexOf(label.time);
                        if (index < 0) return null;
                        const x = pad.left + (timeline.length <= 1 ? innerW / 2 : (index / (timeline.length - 1)) * innerW);
                        return (
                            <text key={label.time} x={x} y={height - 14} textAnchor="middle" className="fill-stone-400 text-[10px]">
                                {label.text}
                            </text>
                        );
                    })}

                    {timeline.map((time, index) => {
                        const x = pad.left + (timeline.length <= 1 ? innerW / 2 : (index / (timeline.length - 1)) * innerW);
                        const slot = Math.max(innerW / Math.max(timeline.length, 1), 8);
                        return (
                            <rect
                                key={`hit-${time}`}
                                x={x - slot / 2}
                                y={pad.top}
                                width={slot}
                                height={innerH}
                                className="fill-transparent"
                                onMouseEnter={() => setHoverIndex(index)}
                                onMouseLeave={() => setHoverIndex(null)}
                            />
                        );
                    })}
                </svg>

                {hoverIndex != null && timeline[hoverIndex] ? (
                    <div className="pointer-events-none absolute left-4 top-4 min-w-[160px] rounded-xl border border-stone-200/80 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-stone-700 dark:bg-stone-950/95">
                        <div className="mb-1.5 font-medium text-stone-800 dark:text-stone-100">{timeline[hoverIndex]}</div>
                        <div className="space-y-1">
                            {mapped.map((line) => {
                                const point = line.coords[hoverIndex];
                                return (
                                    <div key={line.key} className="flex items-center justify-between gap-4">
                                        <span className="inline-flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
                                            <span className="size-2 rounded-full" style={{ background: line.color }} />
                                            {line.label}
                                        </span>
                                        <span className="font-medium text-stone-800 dark:text-stone-100">
                                            {formatTraffic(point?.bytes || 0)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        {!visibleLines.length ? <div className="text-stone-400">{t("storageManager.cdnTrendEmpty")}</div> : null}
                    </div>
                ) : null}
            </div>

            <style>{`
                .cdn-line-draw {
                    stroke-dasharray: 1;
                    stroke-dashoffset: 1;
                    animation: cdn-draw 780ms cubic-bezier(.22,.61,.36,1) forwards;
                }
                @keyframes cdn-draw {
                    to { stroke-dashoffset: 0; }
                }
            `}</style>
            <span className="sr-only">{maxBytes}</span>
        </div>
    );
}

function pickXLabels(timeline: string[]) {
    if (timeline.length <= 8) {
        return timeline.map((time) => ({ time, text: shortenLabel(time) }));
    }
    const step = Math.ceil(timeline.length / 7);
    return timeline
        .filter((_, index) => index % step === 0 || index === timeline.length - 1)
        .map((time) => ({ time, text: shortenLabel(time) }));
}

function shortenLabel(time: string) {
    if (/^\d{4}-\d{2}$/.test(time)) return time;
    if (time.includes(" ")) {
        const [day, clock] = time.split(" ");
        return `${day.slice(5)} ${clock}`;
    }
    return time.length >= 10 ? time.slice(5) : time;
}

export function formatCdnTraffic(bytes: number) {
    return formatTraffic(bytes);
}

export function formatBandwidth(bps?: number) {
    if (!bps || !Number.isFinite(bps) || bps <= 0) return "0 Mbps";
    const mbps = bps / 1_000_000;
    if (mbps >= 100) return `${mbps.toFixed(0)} Mbps`;
    if (mbps >= 10) return `${mbps.toFixed(1)} Mbps`;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    const kbps = bps / 1000;
    return kbps >= 1 ? `${kbps.toFixed(1)} Kbps` : `${bps.toFixed(0)} bps`;
}
