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
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";

import { DEFAULT_SYSTEM_NAME, DEFAULT_SYSTEM_TAGLINE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const EXIT_NAV_MS = 450;
const HOME_VIDEO_SRC = "/public.mp4";
/** Delay WebGL tile field so the DOM video paints first. */
const TILE_FIELD_DELAY_MS = 280;

interface AerisLandingProps {
    className?: string;
}

interface BlockData {
    position: THREE.Vector3;
    phase: number;
    fallDelay: number;
    driftX: number;
    driftY: number;
    spinAxis: THREE.Vector3;
    spinSpeed: number;
}

interface BlockState {
    value: number;
}

const BLOCK_SIZE = 0.45;
const BLOCK_THICKNESS = 0.08;
const PITCH = BLOCK_SIZE;
/** Match original field extent so tiles fill the viewport. */
const GRID_COLS = 30;
const GRID_ROWS = 16;
const HALF_SIZE = BLOCK_SIZE / 2;
const HOVER_TILT = 0.55;
const HOVER_LIFT = 0.22;
const HOVER_RADIUS = PITCH * 2.8;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
const hash = (seed: number) => {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
};

interface AerisBlocksProps {
    title: string;
    tagline: string;
    subtitle: string;
    falling: boolean;
    interactive?: boolean;
    video: HTMLVideoElement | null;
}

function wrapCanvasLines(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number
) {
    const paragraphs = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (paragraphs.length > 1) {
        const lines: string[] = [];
        for (const paragraph of paragraphs) {
            const remaining = maxLines - lines.length;
            if (remaining <= 0) break;
            lines.push(...wrapCanvasLines(ctx, paragraph, maxWidth, remaining));
        }
        return lines;
    }

    const trimmed = paragraphs[0] ?? "";
    if (!trimmed) return [] as string[];

    const hasSpaces = /\s/.test(trimmed);
    const units = hasSpaces ? trimmed.split(/\s+/) : Array.from(trimmed);
    const lines: string[] = [];
    let current = "";

    const pushLine = (line: string) => {
        if (line) lines.push(line);
    };

    for (const unit of units) {
        const next = current ? (hasSpaces ? `${current} ${unit}` : `${current}${unit}`) : unit;
        if (ctx.measureText(next).width <= maxWidth) {
            current = next;
            continue;
        }
        pushLine(current);
        current = unit;
        if (lines.length >= maxLines) break;
    }
    if (lines.length < maxLines) pushLine(current);

    if (lines.length > maxLines) {
        return lines.slice(0, maxLines);
    }
    if (lines.length === maxLines) {
        const last = lines[maxLines - 1];
        if (ctx.measureText(last).width > maxWidth && last.length > 1) {
            lines[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
        }
    }
    return lines.filter(Boolean);
}

function AerisBlocks(props: AerisBlocksProps) {
    const groupRef = useRef<THREE.Group>(null);
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const pointer = useRef(new THREE.Vector2());
    const hoverPoint = useRef(new THREE.Vector3());
    const hoverActive = useRef(false);
    const temp = useRef({
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        axis: new THREE.Vector3(),
        scale: new THREE.Vector3(1, 1, 1),
        matrix: new THREE.Matrix4(),
        offset: new THREE.Matrix4(),
        local: new THREE.Vector3(),
        tumble: new THREE.Quaternion(),
    });
    const fallStart = useRef(-1);
    const hoverPlane = useRef({
        raycaster: new THREE.Raycaster(),
        plane: new THREE.Plane(),
        ndc: new THREE.Vector2(),
        hit: new THREE.Vector3(),
        normal: new THREE.Vector3(),
        origin: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
    });

    const blocks = useMemo<BlockData[]>(() => {
        const list: BlockData[] = [];
        for (let row = 0; row < GRID_ROWS; row += 1) {
            for (let column = 0; column < GRID_COLS; column += 1) {
                const index = row * GRID_COLS + column;
                list.push({
                    position: new THREE.Vector3(
                        (column - (GRID_COLS - 1) / 2) * PITCH,
                        ((GRID_ROWS - 1) / 2 - row) * PITCH,
                        (index % 2) * 0.003
                    ),
                    phase: index * 0.12,
                    fallDelay: hash(index * 3.1) * 0.32,
                    driftX: (hash(index * 7.7) - 0.5) * 1.8,
                    driftY: (hash(index * 9.1) - 0.5) * 1.8,
                    spinAxis: new THREE.Vector3(
                        hash(index + 1) - 0.5,
                        hash(index + 2) - 0.5,
                        hash(index + 3) * 0.4
                    ).normalize(),
                    spinSpeed: 0.8 + hash(index * 5.3) * 2.4,
                });
            }
        }
        return list;
    }, []);

    const drag = useRef({
        active: false,
        ox: 0,
        oy: 0,
        target: new THREE.Vector2(),
        offset: new THREE.Vector2(),
    });
    const interactive = props.interactive ?? true;
    useEffect(() => {
        if (!interactive) return;
        const state = drag.current;
        const down = (event: PointerEvent) => {
            if (
                event.target instanceof Element &&
                event.target.closest(".aeris-actions, a, button")
            ) {
                return;
            }
            state.active = true;
            state.ox = event.clientX;
            state.oy = event.clientY;
        };
        const move = (event: PointerEvent) => {
            if (!state.active) return;
            state.target.set(
                ((event.clientX - state.ox) / window.innerWidth) * 2.4,
                -((event.clientY - state.oy) / window.innerHeight) * 2.4
            );
        };
        const up = () => {
            state.active = false;
            state.target.set(0, 0);
        };
        window.addEventListener("pointerdown", down);
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
            window.removeEventListener("pointerdown", down);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
        };
    }, [interactive]);

    const states = useMemo<BlockState[]>(() => blocks.map(() => ({ value: 0 })), [blocks]);

    const hasTextOverlay = Boolean(
        props.title.trim() || props.tagline.trim() || props.subtitle.trim()
    );

    const textCanvas = useMemo(() => {
        if (!hasTextOverlay) return null;
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 576;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 1;
        texture.generateMipmaps = false;
        texture.premultiplyAlpha = false;
        return { canvas, texture };
    }, [hasTextOverlay]);

    const drawText = useCallback(() => {
        if (!textCanvas) return;
        const ctx = textCanvas.canvas.getContext("2d");
        if (!ctx) return;
        const { width, height } = textCanvas.canvas;
        const display =
            '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "PingFang SC", serif';
        const body =
            '"Public Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
        const maxTextWidth = width * 0.78;

        ctx.clearRect(0, 0, width, height);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let cursorY = height * 0.42;

        if (props.title) {
            const titleSize = Math.round(height * 0.072);
            ctx.fillStyle = "#141414";
            ctx.font = `700 ${titleSize}px ${display}`;
            ctx.fillText(props.title, width / 2, cursorY);
            cursorY += titleSize * 1.05;
        }

        if (props.tagline) {
            const tagSize = Math.round(height * 0.026);
            ctx.fillStyle = "#1c1c20";
            ctx.font = `500 ${tagSize}px ${display}`;
            ctx.fillText(props.tagline, width / 2, cursorY);
            cursorY += tagSize * 1.7;
        }

        if (props.subtitle) {
            const subSize = Math.round(height * 0.02);
            const lineGap = subSize * 1.5;
            ctx.fillStyle = "#2c2c32";
            ctx.font = `400 ${subSize}px ${body}`;
            const lines = wrapCanvasLines(ctx, props.subtitle, maxTextWidth, 3);
            lines.forEach((line, index) => {
                ctx.fillText(line, width / 2, cursorY + index * lineGap);
            });
        }

        textCanvas.texture.needsUpdate = true;
    }, [props.title, props.tagline, props.subtitle, textCanvas]);

    useEffect(() => {
        if (!textCanvas) return;
        drawText();
        document.fonts?.ready.then(drawText).catch(() => {});
    }, [drawText, textCanvas]);

    const uvData = useMemo(() => {
        const fieldW = GRID_COLS * PITCH;
        const fieldH = GRID_ROWS * PITCH;
        const offsets = new Float32Array(blocks.length * 2);
        const scales = new Float32Array(blocks.length * 2);
        blocks.forEach((block, index) => {
            offsets[index * 2] = 0.5 + (block.position.x - BLOCK_SIZE / 2) / fieldW;
            offsets[index * 2 + 1] = 0.5 + (block.position.y - BLOCK_SIZE / 2) / fieldH;
            scales[index * 2] = BLOCK_SIZE / fieldW;
            scales[index * 2 + 1] = BLOCK_SIZE / fieldH;
        });
        return { offsets, scales };
    }, [blocks]);

    const materials = useMemo(() => {
        const side = new THREE.MeshBasicMaterial({
            color: "#1c1814",
        });
        if (!props.video) {
            return [side, side, side, side, side, side];
        }
        const map = new THREE.VideoTexture(props.video);
        map.colorSpace = THREE.SRGBColorSpace;
        map.minFilter = THREE.LinearFilter;
        map.magFilter = THREE.LinearFilter;
        map.generateMipmaps = false;
        const face = new THREE.MeshBasicMaterial({
            color: "#ffffff",
            map,
            toneMapped: false,
        });
        if (textCanvas) {
            face.onBeforeCompile = (shader) => {
                shader.uniforms.uTextMap = { value: textCanvas.texture };
                shader.vertexShader =
                    "attribute vec2 aUvOffset;\nattribute vec2 aUvScale;\n" +
                    shader.vertexShader.replace(
                        "#include <uv_vertex>",
                        "#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = aUvOffset + vMapUv * aUvScale;\n#endif"
                    );
                shader.fragmentShader =
                    "uniform sampler2D uTextMap;\n" +
                    shader.fragmentShader.replace(
                        "#include <map_fragment>",
                        `#include <map_fragment>
vec4 textSample = texture2D(uTextMap, vMapUv);
diffuseColor.rgb = mix(diffuseColor.rgb, textSample.rgb, textSample.a);`
                    );
            };
        } else {
            face.onBeforeCompile = (shader) => {
                shader.vertexShader =
                    "attribute vec2 aUvOffset;\nattribute vec2 aUvScale;\n" +
                    shader.vertexShader.replace(
                        "#include <uv_vertex>",
                        "#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = aUvOffset + vMapUv * aUvScale;\n#endif"
                    );
            };
        }
        return [side, side, side, side, face, side];
    }, [props.video, textCanvas]);

    const edgeGeometry = useMemo(() => {
        const source = new THREE.EdgesGeometry(
            new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_THICKNESS)
        );
        const geometry = new THREE.InstancedBufferGeometry();
        geometry.setAttribute("position", source.getAttribute("position"));
        geometry.instanceCount = blocks.length;
        geometry.setAttribute(
            "aAlpha",
            new THREE.InstancedBufferAttribute(new Float32Array(blocks.length), 1)
        );
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
        return geometry;
    }, [blocks]);

    const edgeMaterial = useMemo(() => {
        const material = new THREE.LineBasicMaterial({ color: "#111111", transparent: true });
        material.onBeforeCompile = (shader) => {
            shader.vertexShader =
                "attribute mat4 instanceMatrix;\nattribute float aAlpha;\nvarying float vAlpha;\n" +
                shader.vertexShader.replace(
                    "#include <begin_vertex>",
                    "vec3 transformed = vec3(position);\ntransformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;\nvAlpha = aAlpha;"
                );
            shader.fragmentShader =
                "varying float vAlpha;\n" +
                shader.fragmentShader.replace(
                    "vec4 diffuseColor = vec4( diffuse, opacity );",
                    "vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );"
                );
        };
        return material;
    }, []);

    useEffect(() => {
        const instanced = meshRef.current;
        if (!instanced) return;
        edgeGeometry.setAttribute("instanceMatrix", instanced.instanceMatrix);
    }, [edgeGeometry]);

    const handleMove = (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        if (!meshRef.current) return;
        meshRef.current.worldToLocal(hoverPoint.current.copy(event.point));
        hoverActive.current = true;
    };

    const handleOut = () => {
        hoverActive.current = false;
    };

    const { camera, gl } = useThree();
    useEffect(() => {
        const state = hoverPlane.current;
        const onMove = (event: PointerEvent) => {
            if (
                event.target instanceof Element &&
                event.target.closest(".aeris-actions, a, button")
            ) {
                return;
            }
            const mesh = meshRef.current;
            if (!mesh) return;
            const rect = gl.domElement.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            state.ndc.set(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );
            state.raycaster.setFromCamera(state.ndc, camera);
            mesh.getWorldQuaternion(state.quat);
            state.normal.set(0, 0, 1).applyQuaternion(state.quat);
            mesh.getWorldPosition(state.origin);
            state.plane.setFromNormalAndCoplanarPoint(state.normal, state.origin);
            if (state.raycaster.ray.intersectPlane(state.plane, state.hit)) {
                mesh.worldToLocal(state.hit);
                hoverPoint.current.copy(state.hit);
                hoverActive.current = true;
            }
        };
        const onLeave = () => {
            hoverActive.current = false;
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("blur", onLeave);
        document.documentElement.addEventListener("pointerleave", onLeave);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("blur", onLeave);
            document.documentElement.removeEventListener("pointerleave", onLeave);
        };
    }, [camera, gl]);

    useFrame(({ clock, pointer: framePointer, camera }) => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        const group = groupRef.current;
        const instanced = meshRef.current;
        if (!group || !instanced) return;
        pointer.current.lerp(framePointer, 0.06);
        const dragState = drag.current;
        dragState.offset.lerp(dragState.target, 0.08);

        if (interactive) {
            group.rotation.x = pointer.current.y * 0.015 + dragState.offset.y * 0.16;
            group.rotation.y = pointer.current.x * 0.02 + dragState.offset.x * 0.2;
            group.position.x = dragState.offset.x * 0.6;
            group.position.y = Math.sin(clock.elapsedTime * 0.2) * 0.02 + dragState.offset.y * 0.6;
            if (!dragState.active) {
                camera.position.x = Math.sin(clock.elapsedTime * 0.08) * 0.12;
                camera.position.y = Math.cos(clock.elapsedTime * 0.06) * 0.05;
            }
            camera.lookAt(0, 0, 0);
        }

        const { position, quaternion, axis, scale, matrix, offset } = temp.current;
        const hp = hoverPoint.current;
        const active = hoverActive.current;
        const alphaAttr = edgeGeometry.getAttribute("aAlpha") as THREE.InstancedBufferAttribute;
        for (let index = 0; index < blocks.length; index += 1) {
            const state = states[index];
            const block = blocks[index];

            const dx = block.position.x - hp.x;
            const dy = block.position.y - hp.y;
            const distance = Math.hypot(dx, dy);
            const raw = active ? clamp01(1 - distance / HOVER_RADIUS) : 0;
            const target = raw * raw * (3 - 2 * raw);
            state.value += (target - state.value) * 0.16;
            const hover = easeOutCubic(clamp01(state.value));

            const length = distance > 0.001 ? distance : 1;
            const dirX = dx / length;
            const dirY = dy / length;
            const variation = 0.75 + 0.45 * Math.abs(Math.sin(block.phase * 3.7));
            const lift = hover * HOVER_LIFT * variation;
            const tilt = hover * HOVER_TILT * variation;

            const hingeX = dirX * HALF_SIZE * hover;
            const hingeY = dirY * HALF_SIZE * hover;
            const wave = Math.sin(clock.elapsedTime * 0.35 + block.phase) * 0.006;
            position.set(
                block.position.x + hingeX,
                block.position.y + hingeY,
                block.position.z + wave + lift
            );
            axis.set(dirY, -dirX, 0);
            quaternion.setFromAxisAngle(axis, -tilt);

            if (props.falling) {
                if (fallStart.current < 0) fallStart.current = clock.elapsedTime;
                const progress = clamp01(
                    (clock.elapsedTime - fallStart.current - block.fallDelay) / 0.55
                );
                const fly = progress * progress;
                position.z += fly * 16;
                position.x += (block.position.x * 0.5 + block.driftX) * fly;
                position.y += (block.position.y * 0.5 + block.driftY) * fly;
                temp.current.tumble.setFromAxisAngle(block.spinAxis, fly * block.spinSpeed);
                quaternion.premultiply(temp.current.tumble);
            }

            matrix.compose(position, quaternion, scale);
            offset.makeTranslation(-dirX * HALF_SIZE * hover, -dirY * HALF_SIZE * hover, 0);
            matrix.multiply(offset);
            instanced.setMatrixAt(index, matrix);
            alphaAttr.array[index] = 0.28 + hover * 0.62;
        }
        instanced.instanceMatrix.needsUpdate = true;
        alphaAttr.needsUpdate = true;
    });

    return (
        <group ref={groupRef}>
            <instancedMesh
                ref={meshRef}
                args={[undefined, undefined, blocks.length]}
                castShadow
                material={materials}
                onPointerMove={handleMove}
                onPointerOut={handleOut}
            >
                <boxGeometry args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_THICKNESS]}>
                    <instancedBufferAttribute
                        args={[uvData.offsets, 2]}
                        attach="attributes-aUvOffset"
                    />
                    <instancedBufferAttribute
                        args={[uvData.scales, 2]}
                        attach="attributes-aUvScale"
                    />
                </boxGeometry>
            </instancedMesh>
            <lineSegments frustumCulled={false} geometry={edgeGeometry} material={edgeMaterial} />
        </group>
    );
}

interface AerisTileFieldProps {
    title?: string;
    tagline?: string;
    subtitle?: string;
    falling?: boolean;
    interactive?: boolean;
    video: HTMLVideoElement | null;
}

export function AerisTileField(props: AerisTileFieldProps) {
    return (
        <Canvas
            flat
            camera={{ position: [0, 0, 7], fov: 40 }}
            dpr={1}
            gl={{
                alpha: true,
                antialias: false,
                powerPreference: "high-performance",
                stencil: false,
                depth: true,
            }}
            onCreated={({ gl }) => {
                gl.setClearColor(0x000000, 0);
            }}
        >
            <ambientLight color="#ffffff" intensity={1} />
            <directionalLight color="#ffffff" intensity={0.55} position={[-4, 6, 8]} />
            <AerisBlocks
                falling={props.falling ?? false}
                interactive={props.interactive ?? true}
                subtitle={props.subtitle ?? ""}
                tagline={props.tagline ?? ""}
                title={props.title ?? ""}
                video={props.video}
            />
        </Canvas>
    );
}

export function AerisLanding(props: AerisLandingProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const isAuthenticated = Boolean(useAuthStore((s) => s.auth.user));
    const hasAccessToken = Boolean(useAuthStore((s) => s.auth.accessToken));
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    const [falling, setFalling] = useState(false);
    const [tilesReady, setTilesReady] = useState(false);
    const [videoReady, setVideoReady] = useState(false);

    const title = DEFAULT_SYSTEM_NAME;
    const tagline = t("Simplicity is the way. Create the future.");
    const subtitle = t(
        "One studio for frontier image, video, and voice—from idea to finished work."
    );

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = true;
        const markReady = () => setVideoReady(true);
        const play = () => {
            void video.play().catch(() => undefined);
        };
        if (video.readyState >= 2) {
            markReady();
            play();
        }
        video.addEventListener("loadeddata", markReady);
        video.addEventListener("canplay", play);
        play();
        return () => {
            video.removeEventListener("loadeddata", markReady);
            video.removeEventListener("canplay", play);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        let idleId = 0;
        let timeoutId = 0;

        const enable = () => {
            if (!cancelled) setTilesReady(true);
        };

        const schedule = () => {
            if (typeof window !== "undefined" && "requestIdleCallback" in window) {
                idleId = window.requestIdleCallback(enable, { timeout: 900 });
            } else {
                timeoutId = window.setTimeout(enable, TILE_FIELD_DELAY_MS);
            }
        };

        timeoutId = window.setTimeout(schedule, TILE_FIELD_DELAY_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
            if (idleId && "cancelIdleCallback" in window) {
                window.cancelIdleCallback(idleId);
            }
        };
    }, []);

    const enterWithAuth = useCallback(
        (target: "/canvas" | "/dashboard") => {
            if (falling) return;

            if (!(isAuthenticated && hasAccessToken)) {
                navigate(`/sign-in?redirect=${encodeURIComponent(target)}`);
                return;
            }

            setFalling(true);
            window.setTimeout(() => {
                startTransition(() => {
                    navigate(target);
                });
            }, EXIT_NAV_MS);
        },
        [falling, hasAccessToken, isAuthenticated, navigate]
    );

    const bindVideoRef = useCallback((node: HTMLVideoElement | null) => {
        videoRef.current = node;
        setVideoEl((prev) => (prev === node ? prev : node));
    }, []);

    return (
        <main className={cn("aeris-landing", props.className)}>
            <div className="aeris-media" aria-hidden="true">
                <video
                    ref={bindVideoRef}
                    className={cn("aeris-video", videoReady && "is-ready")}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                >
                    <source src={HOME_VIDEO_SRC} type="video/mp4" />
                </video>
                <div className="aeris-veil" />
            </div>
            {tilesReady ? (
                <div className="aeris-canvas" aria-hidden="true">
                    <AerisTileField
                        falling={falling}
                        subtitle=""
                        tagline=""
                        title=""
                        video={videoEl}
                    />
                </div>
            ) : null}
            <div className={cn("aeris-copy", falling && "is-falling")}>
                <div className="aeris-hero">
                    <p className="aeris-hero-eyebrow">{DEFAULT_SYSTEM_TAGLINE}</p>
                    <h1 className="aeris-hero-title">{title}</h1>
                    <p className="aeris-hero-tagline">{tagline}</p>
                    <p className="aeris-hero-subtitle">{subtitle}</p>
                </div>
                <div className="aeris-actions">
                    <button
                        className="aeris-enter"
                        type="button"
                        disabled={falling}
                        onClick={() => {
                            void enterWithAuth("/canvas");
                        }}
                    >
                        {t("Enter Canvas")}
                    </button>
                    <button
                        className="aeris-enter aeris-enter--ghost"
                        type="button"
                        disabled={falling}
                        onClick={() => {
                            void enterWithAuth("/dashboard");
                        }}
                    >
                        {t("Enter Console")}
                    </button>
                </div>
            </div>
        </main>
    );
}
