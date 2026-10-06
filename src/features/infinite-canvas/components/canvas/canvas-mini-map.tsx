import { useCallback, useMemo, useRef, useState } from "react";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import { getNodeDefinition } from "@canvas/lib/canvas/node-registry";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { type CanvasNodeData, type ViewportTransform } from "@canvas/types/canvas";

type MiniMapSceneProps = {
    nodes: CanvasNodeData[];
    width: number;
    height: number;
    viewport?: ViewportTransform | null;
    viewportSize?: { width: number; height: number } | null;
    interactive?: boolean;
    onViewportChange?: (viewport: ViewportTransform) => void;
};

export function MiniMapScene({ nodes, width, height, viewport, viewportSize, interactive = false, onViewportChange }: MiniMapSceneProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const { worldBounds, scale, offset } = useMemo(() => {
        if (!nodes.length) {
            return { worldBounds: { x: -500, y: -500, w: 1000, h: 1000 }, scale: 0.16, offset: { x: 40, y: 0 } };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        nodes.forEach((node) => {
            minX = Math.min(minX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxX = Math.max(maxX, node.position.x + node.width);
            maxY = Math.max(maxY, node.position.y + node.height);
        });

        minX -= 280;
        minY -= 220;
        maxX += 280;
        maxY += 220;

        const boundsWidth = maxX - minX;
        const boundsHeight = maxY - minY;
        const nextScale = Math.min(width / boundsWidth, height / boundsHeight);
        const mapContentW = boundsWidth * nextScale;
        const mapContentH = boundsHeight * nextScale;

        return {
            worldBounds: { x: minX, y: minY, w: boundsWidth, h: boundsHeight },
            scale: nextScale,
            offset: { x: (width - mapContentW) / 2, y: (height - mapContentH) / 2 },
        };
    }, [height, nodes, width]);

    const toMinimap = useCallback(
        (worldX: number, worldY: number) => {
            return {
                x: (worldX - worldBounds.x) * scale + offset.x,
                y: (worldY - worldBounds.y) * scale + offset.y,
            };
        },
        [offset.x, offset.y, scale, worldBounds.x, worldBounds.y],
    );

    const toWorld = useCallback(
        (minimapX: number, minimapY: number) => {
            return {
                x: (minimapX - offset.x) / scale + worldBounds.x,
                y: (minimapY - offset.y) / scale + worldBounds.y,
            };
        },
        [offset.x, offset.y, scale, worldBounds.x, worldBounds.y],
    );

    const viewportRect = useMemo(() => {
        if (!viewport || !viewportSize) return null;
        const vx = -viewport.x / viewport.k;
        const vy = -viewport.y / viewport.k;
        const vw = viewportSize.width / viewport.k;
        const vh = viewportSize.height / viewport.k;
        const p1 = toMinimap(vx, vy);
        const p2 = toMinimap(vx + vw, vy + vh);

        return {
            x: p1.x,
            y: p1.y,
            w: Math.max(p2.x - p1.x, 4),
            h: Math.max(p2.y - p1.y, 4),
        };
    }, [toMinimap, viewport, viewportSize]);

    const updateViewportFromEvent = (event: React.PointerEvent) => {
        if (!interactive || !viewport || !viewportSize || !onViewportChange) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const world = toWorld(event.clientX - rect.left, event.clientY - rect.top);
        onViewportChange({
            x: viewportSize.width / 2 - world.x * viewport.k,
            y: viewportSize.height / 2 - world.y * viewport.k,
            k: viewport.k,
        });
    };

    return (
        <div
            ref={containerRef}
            className={interactive ? "relative h-full w-full cursor-crosshair overflow-hidden" : "relative h-full w-full overflow-hidden"}
            onPointerDown={
                interactive
                    ? (event) => {
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setIsDragging(true);
                          updateViewportFromEvent(event);
                      }
                    : undefined
            }
            onPointerMove={interactive ? (event) => { if (isDragging) updateViewportFromEvent(event); } : undefined}
            onPointerUp={interactive ? () => setIsDragging(false) : undefined}
            onPointerLeave={interactive ? () => setIsDragging(false) : undefined}
        >
            {nodes.map((node) => {
                const pos = toMinimap(node.position.x, node.position.y);
                const color = getNodeDefinition(node.type)?.minimapColor || theme.node.muted;
                const w = Math.max(node.width * scale, 6);
                const h = Math.max(node.height * scale, 6);
                const title = (node.title || getNodeDefinition(node.type)?.title || "").trim();
                const showTitle = Boolean(title) && w >= 18;
                const pillLeft = Math.max(2, pos.x - 2);
                const pillTop = Math.max(2, pos.y - 11);
                return (
                    <div key={node.id}>
                        <div
                            className="absolute rounded-[3px]"
                            style={{
                                left: pos.x,
                                top: pos.y,
                                width: w,
                                height: h,
                                backgroundColor: color,
                                opacity: 0.92,
                            }}
                        />
                        {showTitle ? (
                            <div
                                className="pointer-events-none absolute z-[1] max-w-[92%] truncate rounded-md px-1.5 py-0.5 text-[9px] font-medium leading-none text-white shadow-sm"
                                style={{
                                    left: pillLeft,
                                    top: pillTop,
                                    background: "rgba(28,28,30,.88)",
                                    maxWidth: Math.max(w + 8, 56),
                                }}
                                title={title}
                            >
                                {title}
                            </div>
                        ) : null}
                    </div>
                );
            })}
            {viewportRect ? (
                <div
                    className="pointer-events-none absolute border"
                    style={{
                        left: viewportRect.x,
                        top: viewportRect.y,
                        width: viewportRect.w,
                        height: viewportRect.h,
                        borderColor: theme.node.activeStroke,
                        background: `${theme.node.activeStroke}18`,
                    }}
                />
            ) : null}
        </div>
    );
}

export function Minimap({ nodes, viewport, viewportSize, onViewportChange }: { nodes: CanvasNodeData[]; viewport: ViewportTransform; viewportSize: { width: number; height: number }; onViewportChange: (viewport: ViewportTransform) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const width = 280;
    const height = 188;

    return (
        <div className="absolute bottom-24 left-6 z-50 overflow-hidden rounded-lg border shadow-2xl backdrop-blur-sm" style={{ width, height, background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
            <MiniMapScene nodes={nodes} width={width} height={height} viewport={viewport} viewportSize={viewportSize} interactive onViewportChange={onViewportChange} />
        </div>
    );
}

export function MiniMapPreview({ nodes, width = 220, height = 112 }: { nodes: CanvasNodeData[]; width?: number; height?: number }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="overflow-hidden rounded-lg border" style={{ width, height, background: theme.canvas.background, borderColor: theme.toolbar.border }}>
            <MiniMapScene nodes={nodes} width={width} height={height} />
        </div>
    );
}
