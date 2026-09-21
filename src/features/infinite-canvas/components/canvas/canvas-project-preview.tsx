import { useMemo } from "react";

import type { CanvasProject } from "@canvas/stores/canvas/use-canvas-store";

function hashSeed(input: string) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function nextUnit(seed: { value: number }) {
    seed.value = (Math.imul(seed.value, 1664525) + 1013904223) >>> 0;
    return seed.value / 0x100000000;
}

type PreviewNode = { x: number; y: number; w: number; h: number };
type PreviewEdge = { x1: number; y1: number; x2: number; y2: number };

export function CanvasProjectPreview({ project }: { project: CanvasProject }) {
    const { nodes, edges } = useMemo(() => {
        const seed = { value: hashSeed(project.id || project.title || "canvas") };
        const count = Math.min(7, Math.max(2, project.nodes?.length || 2));
        const nextNodes: PreviewNode[] = Array.from({ length: count }, () => {
            const w = 10 + nextUnit(seed) * 16;
            const h = 8 + nextUnit(seed) * 12;
            return {
                x: 8 + nextUnit(seed) * (84 - w),
                y: 10 + nextUnit(seed) * (72 - h),
                w,
                h,
            };
        });
        const edgeCount = Math.min(count, Math.max(1, Math.min(project.connections?.length || 1, count - 1)));
        const nextEdges: PreviewEdge[] = Array.from({ length: edgeCount }, (_, index) => {
            const from = nextNodes[index % nextNodes.length];
            const to = nextNodes[(index + 1) % nextNodes.length];
            return {
                x1: from.x + from.w / 2,
                y1: from.y + from.h / 2,
                x2: to.x + to.w / 2,
                y2: to.y + to.h / 2,
            };
        });
        return { nodes: nextNodes, edges: nextEdges };
    }, [project.connections?.length, project.id, project.nodes?.length, project.title]);

    return (
        <div className="relative aspect-[5/3] overflow-hidden rounded-lg">
            <div
                aria-hidden
                className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.03] dark:hidden"
                style={{
                    background:
                        "radial-gradient(ellipse 70% 55% at 20% 15%, rgba(120,113,108,0.22), transparent 55%), radial-gradient(ellipse 55% 45% at 85% 75%, rgba(68,64,60,0.14), transparent 50%), linear-gradient(160deg, #ebe7df 0%, #f4f2ed 48%, #e4dfd5 100%)",
                }}
            />
            <div
                aria-hidden
                className="absolute inset-0 hidden transition-transform duration-500 ease-out group-hover:scale-[1.03] dark:block"
                style={{
                    background:
                        "radial-gradient(ellipse 70% 55% at 20% 15%, rgba(168,162,158,0.16), transparent 55%), linear-gradient(160deg, #1c1917 0%, #292524 50%, #181715 100%)",
                }}
            />
            <div
                aria-hidden
                className="absolute inset-0 opacity-40 dark:opacity-25"
                style={{
                    backgroundImage: "radial-gradient(rgba(28,25,23,0.22) 1px, transparent 1px)",
                    backgroundSize: "12px 12px",
                }}
            />
            <svg viewBox="0 0 100 80" className="absolute inset-0 h-full w-full transition-transform duration-500 ease-out group-hover:translate-y-[-1px]" aria-hidden>
                {edges.map((edge, index) => (
                    <line
                        key={`e-${index}`}
                        x1={edge.x1}
                        y1={edge.y1}
                        x2={edge.x2}
                        y2={edge.y2}
                        className="stroke-stone-500/35 dark:stroke-stone-300/30"
                        strokeWidth="0.7"
                    />
                ))}
                {nodes.map((node, index) => (
                    <rect
                        key={`n-${index}`}
                        x={node.x}
                        y={node.y}
                        width={node.w}
                        height={node.h}
                        rx="1.6"
                        className="fill-stone-50/90 stroke-stone-700/25 dark:fill-stone-800/90 dark:stroke-stone-200/25"
                        strokeWidth="0.6"
                    />
                ))}
            </svg>
        </div>
    );
}

export function CanvasEmptyPreview() {
    return (
        <div className="relative mx-auto w-full max-w-[220px] overflow-hidden rounded-xl border border-stone-300/60 dark:border-stone-700/60">
            <div
                aria-hidden
                className="aspect-[5/3]"
                style={{
                    background:
                        "radial-gradient(ellipse 70% 55% at 30% 20%, rgba(120,113,108,0.18), transparent 55%), linear-gradient(160deg, #ebe7df 0%, #f4f2ed 55%, #e4dfd5 100%)",
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-35"
                style={{
                    backgroundImage: "radial-gradient(rgba(28,25,23,0.2) 1px, transparent 1px)",
                    backgroundSize: "12px 12px",
                }}
            />
            <svg viewBox="0 0 100 80" className="absolute inset-0 h-full w-full" aria-hidden>
                <rect x="18" y="22" width="22" height="16" rx="2" className="fill-stone-50/80 stroke-stone-600/20" strokeWidth="0.7" />
                <rect x="52" y="34" width="28" height="18" rx="2" className="fill-stone-50/80 stroke-stone-600/20" strokeWidth="0.7" />
                <line x1="40" y1="30" x2="52" y2="42" className="stroke-stone-500/30" strokeWidth="0.7" />
            </svg>
        </div>
    );
}
