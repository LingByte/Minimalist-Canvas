/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
    GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type Shard = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    angle: number;
    spin: number;
    depth: number;
    tint: number;
};

type AeroShardsFallbackProps = {
    className?: string;
    backgroundColor?: string;
    shardColor?: string;
    accentColor?: string;
};

function parseHex(hex: string, fallback: [number, number, number]): [number, number, number] {
    const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    if (!match) return fallback;
    return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function mix(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export function AeroShardsFallback({
    className,
    backgroundColor = "#0d0a12",
    shardColor = "#629de8",
    accentColor = "#96beff",
}: AeroShardsFallbackProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        const canvas = canvasRef.current;
        if (!root || !canvas) return;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        const bg = parseHex(backgroundColor, [13, 10, 18]);
        const base = parseHex(shardColor, [98, 157, 232]);
        const accent = parseHex(accentColor, [150, 190, 255]);
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        let width = 0;
        let height = 0;
        let dpr = 1;
        let raf = 0;
        let disposed = false;
        let last = performance.now();
        let bounds = root.getBoundingClientRect();
        let boundsDirty = true;

        const pointer = { x: 0.5, y: 0.5, active: 0, tx: 0.5, ty: 0.5 };
        const shards: Shard[] = [];

        const seedShards = (count: number) => {
            shards.length = 0;
            for (let i = 0; i < count; i += 1) {
                shards.push({
                    x: Math.random(),
                    y: Math.random(),
                    vx: (Math.random() - 0.5) * 0.08,
                    vy: (Math.random() - 0.35) * 0.04,
                    w: 6 + Math.random() * 18,
                    h: 18 + Math.random() * 42,
                    angle: Math.random() * Math.PI,
                    spin: (Math.random() - 0.5) * 1.4,
                    depth: 0.35 + Math.random() * 0.65,
                    tint: Math.random(),
                });
            }
        };

        const resize = () => {
            bounds = root.getBoundingClientRect();
            boundsDirty = false;
            width = Math.max(1, Math.round(bounds.width));
            height = Math.max(1, Math.round(bounds.height));
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.max(1, Math.round(width * dpr));
            canvas.height = Math.max(1, Math.round(height * dpr));
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const count = Math.round(Math.min(220, Math.max(90, (width * height) / 9000)));
            if (shards.length === 0 || Math.abs(shards.length - count) > 30) seedShards(count);
        };

        const pointFromClient = (clientX: number, clientY: number) => {
            if (boundsDirty) {
                bounds = root.getBoundingClientRect();
                boundsDirty = false;
            }
            if (bounds.width <= 0 || bounds.height <= 0) return null;
            const x = (clientX - bounds.left) / bounds.width;
            const y = (clientY - bounds.top) / bounds.height;
            if (x < 0 || x > 1 || y < 0 || y > 1) return null;
            return { x, y };
        };

        const onMove = (event: PointerEvent) => {
            if (!event.isPrimary) return;
            const next = pointFromClient(event.clientX, event.clientY);
            if (!next) {
                pointer.active = 0;
                return;
            }
            pointer.tx = next.x;
            pointer.ty = next.y;
            pointer.active = 1;
        };

        const onLeave = () => {
            pointer.active = 0;
        };

        const onScroll = () => {
            boundsDirty = true;
        };

        const drawFrame = (now: number) => {
            if (disposed) return;
            const elapsed = Math.min(0.05, Math.max(0, (now - last) / 1000));
            last = now;

            pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-elapsed * 18));
            pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-elapsed * 18));

            ctx.fillStyle = `rgb(${bg[0]} ${bg[1]} ${bg[2]})`;
            ctx.fillRect(0, 0, width, height);

            const glow = ctx.createRadialGradient(
                pointer.x * width,
                pointer.y * height,
                0,
                pointer.x * width,
                pointer.y * height,
                Math.max(width, height) * 0.42
            );
            glow.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.16 * pointer.active})`);
            glow.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, width, height);

            const frozen = reduceMotion.matches;
            const px = pointer.x * width;
            const py = pointer.y * height;
            const radius = Math.min(width, height) * 0.22;

            for (const shard of shards) {
                if (!frozen) {
                    shard.x += shard.vx * elapsed * shard.depth;
                    shard.y += shard.vy * elapsed * shard.depth;
                    shard.angle += shard.spin * elapsed;

                    if (shard.x < -0.08) shard.x = 1.08;
                    if (shard.x > 1.08) shard.x = -0.08;
                    if (shard.y < -0.08) shard.y = 1.08;
                    if (shard.y > 1.08) shard.y = -0.08;

                    if (pointer.active > 0.01) {
                        const sx = shard.x * width;
                        const sy = shard.y * height;
                        const dx = sx - px;
                        const dy = sy - py;
                        const dist = Math.hypot(dx, dy) || 1;
                        if (dist < radius) {
                            const force = (1 - dist / radius) ** 2 * 1.8 * shard.depth;
                            shard.vx += (dx / dist) * force * elapsed * 8;
                            shard.vy += (dy / dist) * force * elapsed * 8;
                        }
                    }

                    shard.vx *= Math.exp(-elapsed * 1.2);
                    shard.vy *= Math.exp(-elapsed * 1.2);
                    shard.vx += 0.035 * elapsed * shard.depth;
                    shard.vy += Math.sin(now * 0.001 + shard.tint * 12) * 0.01 * elapsed;
                }

                const x = shard.x * width;
                const y = shard.y * height;
                const alpha = mix(0.28, 0.92, shard.depth);
                const r = Math.round(mix(base[0], accent[0], shard.tint));
                const g = Math.round(mix(base[1], accent[1], shard.tint));
                const b = Math.round(mix(base[2], accent[2], shard.tint));

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(shard.angle);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = `rgb(${r} ${g} ${b})`;
                ctx.beginPath();
                ctx.moveTo(0, -shard.h * 0.5);
                ctx.lineTo(shard.w * 0.45, 0);
                ctx.lineTo(0, shard.h * 0.5);
                ctx.lineTo(-shard.w * 0.45, 0);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            raf = requestAnimationFrame(drawFrame);
        };

        resize();
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("blur", onLeave);
        window.addEventListener("scroll", onScroll, { passive: true, capture: true });
        const ro = new ResizeObserver(() => {
            boundsDirty = true;
            resize();
        });
        ro.observe(root);
        raf = requestAnimationFrame(drawFrame);

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("blur", onLeave);
            window.removeEventListener("scroll", onScroll, true);
            ro.disconnect();
        };
    }, [accentColor, backgroundColor, shardColor]);

    return (
        <div
            ref={rootRef}
            className={cn("aeris-shards-fallback", className)}
            style={{ backgroundColor }}
            aria-hidden="true"
        >
            <canvas ref={canvasRef} className="aeris-shards-fallback__canvas" />
        </div>
    );
}
