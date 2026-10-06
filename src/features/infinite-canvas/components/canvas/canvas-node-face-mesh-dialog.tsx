import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Button, Drawer, Segmented, Slider, Tooltip } from "antd";
import { Brush, Eraser, Redo2, RotateCcw, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useImageEditorViewport } from "@canvas/components/canvas/use-image-editor-viewport";
import {
    DEFAULT_FACE_MESH_PARAMS,
    createFaceMeshPatternCanvas,
    overlayFaceMeshDataUrl,
    type FaceMeshParams,
    type FaceMeshPattern,
} from "@canvas/lib/canvas/canvas-image-data";
import { readImageMeta } from "@canvas/lib/image-utils";

export type CanvasFaceMeshParams = FaceMeshParams;

type DrawMode = "paint" | "erase";
type Point = { x: number; y: number };
type MeshStroke = { mode: DrawMode; size: number; points: Point[] };
type BrushPreview = { x: number; y: number; size: number; adjusting: boolean };

const defaultBrushSize = 72;
const patterns: FaceMeshPattern[] = ["diamond", "square"];

export function CanvasNodeFaceMeshDialog({
    dataUrl,
    open,
    onClose,
    onConfirm,
}: {
    dataUrl: string;
    open: boolean;
    onClose: () => void;
    onConfirm: (resultDataUrl: string) => void;
}) {
    const { t } = useTranslation();
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef<{ active: boolean; stroke: MeshStroke | null }>({ active: false, stroke: null });
    const brushAdjustRef = useRef<{ active: boolean; pointerId: number; startX: number; startSize: number; previewX: number; previewY: number } | null>(null);
    const historyRef = useRef<MeshStroke[]>([]);
    const redoRef = useRef<MeshStroke[]>([]);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [params, setParams] = useState<FaceMeshParams>(DEFAULT_FACE_MESH_PARAMS);
    const [brushSize, setBrushSize] = useState(defaultBrushSize);
    const [mode, setMode] = useState<DrawMode>("paint");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [historySize, setHistorySize] = useState(0);
    const [redoSize, setRedoSize] = useState(0);
    const [brushPreview, setBrushPreview] = useState<BrushPreview | null>(null);
    const viewport = useImageEditorViewport(image, open);

    const refreshPreview = useCallback(() => {
        const preview = previewCanvasRef.current;
        const mask = maskCanvasRef.current;
        const pattern = patternCanvasRef.current;
        if (!preview || !mask || !pattern || !image) return;
        const context = preview.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, preview.width, preview.height);
        context.drawImage(pattern, 0, 0);
        context.globalCompositeOperation = "destination-in";
        context.drawImage(mask, 0, 0);
        context.globalCompositeOperation = "source-over";
    }, [image]);

    useEffect(() => {
        if (!open) return;
        setParams(DEFAULT_FACE_MESH_PARAMS);
        setBrushSize(defaultBrushSize);
        setMode("paint");
        setError("");
        setBusy(false);
        setHistorySize(0);
        setRedoSize(0);
        setBrushPreview(null);
        historyRef.current = [];
        redoRef.current = [];
        brushAdjustRef.current = null;
        drawingRef.current = { active: false, stroke: null };
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    useEffect(() => {
        if (!image) return;
        const mask = maskCanvasRef.current;
        const preview = previewCanvasRef.current;
        if (mask) {
            mask.width = image.width;
            mask.height = image.height;
            clearCanvas(mask);
        }
        if (preview) {
            preview.width = image.width;
            preview.height = image.height;
            clearCanvas(preview);
        }
        patternCanvasRef.current = createFaceMeshPatternCanvas(image.width, image.height, params);
        historyRef.current = [];
        redoRef.current = [];
        setHistorySize(0);
        setRedoSize(0);
        refreshPreview();
    }, [image]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when source image changes

    useEffect(() => {
        if (!image) return;
        patternCanvasRef.current = createFaceMeshPatternCanvas(image.width, image.height, params);
        refreshPreview();
    }, [image, params, refreshPreview]);

    const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const point = readCanvasPoint(event.currentTarget, event.clientX, event.clientY);
        const maskCanvas = maskCanvasRef.current;
        const context = maskCanvas?.getContext("2d", { willReadFrequently: true });
        const stroke = drawingRef.current.stroke;
        if (!maskCanvas || !context || !stroke) return;
        configureStrokeContext(context, stroke);
        const last = stroke.points.at(-1);
        drawBrushStroke(context, last || point, point, stroke.size);
        stroke.points.push(point);
        refreshPreview();
        if (stroke.mode === "paint") setError("");
    };

    const updateBrushPreview = (event: ReactPointerEvent<HTMLCanvasElement>, size = brushSize, adjusting = false) => {
        setBrushPreview({ x: event.clientX, y: event.clientY, size, adjusting });
    };

    const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if ((event.button === 0 || event.button === 2) && event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            brushAdjustRef.current = {
                active: true,
                pointerId: event.pointerId,
                startX: event.clientX,
                startSize: brushSize,
                previewX: event.clientX,
                previewY: event.clientY,
            };
            updateBrushPreview(event, brushSize, true);
            return;
        }
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateBrushPreview(event);
        drawingRef.current = { active: true, stroke: { mode, size: brushSize, points: [] } };
        draw(event);
    };

    const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const brushAdjust = brushAdjustRef.current;
        if (brushAdjust?.active && event.pointerId === brushAdjust.pointerId) {
            event.preventDefault();
            event.stopPropagation();
            const nextSize = clampBrushSize(brushAdjust.startSize + event.clientX - brushAdjust.startX);
            setBrushSize(nextSize);
            setBrushPreview({
                x: brushAdjust.previewX,
                y: brushAdjust.previewY,
                size: nextSize,
                adjusting: true,
            });
            return;
        }
        updateBrushPreview(event);
        if (!drawingRef.current.active) return;
        event.preventDefault();
        draw(event);
    };

    const stopDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const brushAdjust = brushAdjustRef.current;
        if (brushAdjust?.active && event.pointerId === brushAdjust.pointerId) {
            brushAdjustRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            updateBrushPreview(event, brushSize);
            return;
        }
        const stroke = drawingRef.current.stroke;
        drawingRef.current = { active: false, stroke: null };
        if (stroke?.points.length) {
            historyRef.current.push(stroke);
            setHistorySize(historyRef.current.length);
            redoRef.current = [];
            setRedoSize(0);
        }
    };

    const replayMask = useCallback(
        (strokes: MeshStroke[]) => {
            const mask = maskCanvasRef.current;
            if (!mask) return;
            clearCanvas(mask);
            const context = mask.getContext("2d", { willReadFrequently: true });
            if (!context) return;
            for (const stroke of strokes) {
                configureStrokeContext(context, stroke);
                if (!stroke.points.length) continue;
                let previous = stroke.points[0];
                drawBrushStroke(context, previous, previous, stroke.size);
                for (let index = 1; index < stroke.points.length; index += 1) {
                    const point = stroke.points[index];
                    drawBrushStroke(context, previous, point, stroke.size);
                    previous = point;
                }
            }
            refreshPreview();
        },
        [refreshPreview],
    );

    const undoStroke = useCallback(() => {
        if (drawingRef.current.active || !historyRef.current.length) return;
        const stroke = historyRef.current.pop();
        if (stroke) redoRef.current.push(stroke);
        setHistorySize(historyRef.current.length);
        setRedoSize(redoRef.current.length);
        replayMask(historyRef.current);
        setError("");
    }, [replayMask]);

    const redoStroke = useCallback(() => {
        if (drawingRef.current.active || !redoRef.current.length) return;
        const stroke = redoRef.current.pop();
        if (stroke) historyRef.current.push(stroke);
        setHistorySize(historyRef.current.length);
        setRedoSize(redoRef.current.length);
        replayMask(historyRef.current);
        setError("");
    }, [replayMask]);

    const resetPaint = () => {
        historyRef.current = [];
        redoRef.current = [];
        setHistorySize(0);
        setRedoSize(0);
        clearCanvas(maskCanvasRef.current);
        refreshPreview();
        setError("");
    };

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("input,textarea,[contenteditable='true']")) return;
            const key = event.key.toLowerCase();
            const modifier = (event.metaKey || event.ctrlKey) && !event.altKey;
            const isUndo = modifier && !event.shiftKey && key === "z";
            const isRedo = modifier && ((event.shiftKey && key === "z") || (!event.shiftKey && key === "y"));
            if (!isUndo && !isRedo) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            if (isRedo) redoStroke();
            else undoStroke();
        };
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [open, redoStroke, undoStroke]);

    const submit = async () => {
        const mask = maskCanvasRef.current;
        if (!mask) return;
        if (!canvasHasPaint(mask)) {
            setError(t("canvas.editors.faceMeshPaintRequired"));
            return;
        }
        setBusy(true);
        try {
            const maskDataUrl = mask.toDataURL("image/png");
            const result = await overlayFaceMeshDataUrl(dataUrl, params, maskDataUrl);
            onConfirm(result);
        } catch (error) {
            const raw = error instanceof Error ? error.message : "";
            setError(
                /cross-origin|CORS|tainted|SecurityError|cannot be exported/i.test(raw)
                    ? t("canvas.editors.faceMeshCorsFailed")
                    : raw || t("canvas.projectPage.uploadFailed"),
            );
        } finally {
            setBusy(false);
        }
    };

    const densityLabel =
        params.spacingRatio <= 0.028
            ? t("canvas.editors.meshDense")
            : params.spacingRatio >= 0.055
              ? t("canvas.editors.meshSparse")
              : t("canvas.editors.meshMedium");

    return (
        <Drawer
            title={
                <div className="pr-6">
                    <div className="text-base font-semibold leading-tight">{t("canvas.editors.faceMeshTitle")}</div>
                    <div className="mt-1 text-xs font-normal opacity-55">
                        {image ? `${image.width} × ${image.height}px` : t("canvas.editors.loading")}
                    </div>
                </div>
            }
            open={open && Boolean(dataUrl)}
            onClose={onClose}
            placement="right"
            size={560}
            destroyOnClose
            rootClassName="[&_.ant-drawer-content-wrapper]:max-w-full"
            styles={{
                content: { display: "flex", flexDirection: "column", height: "100%" },
                body: { padding: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" },
                footer: { padding: "12px 16px" },
            }}
            footer={
                <div className="flex items-center justify-between gap-2">
                    <Button icon={<RotateCcw className="size-4" />} onClick={resetPaint}>
                        {t("canvas.editors.reset")}
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button icon={<X className="size-4" />} onClick={onClose}>
                            {t("canvas.editors.cancel")}
                        </Button>
                        <Button type="primary" loading={busy} onClick={() => void submit()}>
                            {t("canvas.editors.applyFaceMesh")}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex h-full min-h-0 flex-col" data-canvas-no-zoom>
                <div
                    ref={viewport.viewportRef}
                    {...viewport.panHandlers}
                    className={`relative h-[min(42vh,380px)] shrink-0 border-b border-black/10 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,.06)_1px,transparent_0)] [background-size:12px_12px] dark:border-white/10 dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,.08)_1px,transparent_0)] ${viewport.scrollClassName} ${viewport.isPanning ? "cursor-grabbing" : viewport.spacePressed ? "cursor-grab" : ""}`}
                >
                    <div className="relative" style={viewport.contentStyle}>
                        <div
                            ref={viewport.stageRef}
                            className="absolute isolate overflow-hidden rounded-lg bg-transparent select-none [backface-visibility:hidden] [contain:layout_paint] [transform:translateZ(0)]"
                            style={viewport.stageStyle}
                        >
                            {image ? (
                                <>
                                    <canvas ref={maskCanvasRef} width={image.width} height={image.height} className="hidden" />
                                    <div className="absolute left-0 top-0 [backface-visibility:hidden]" style={viewport.mediaStyle}>
                                        <img src={dataUrl} alt="" className="absolute inset-0 block h-full w-full bg-transparent object-contain" draggable={false} />
                                        <canvas
                                            ref={previewCanvasRef}
                                            width={image.width}
                                            height={image.height}
                                            className="absolute inset-0 h-full w-full cursor-none touch-none"
                                            onPointerDown={startDraw}
                                            onPointerMove={moveDraw}
                                            onPointerUp={stopDraw}
                                            onPointerCancel={stopDraw}
                                            onPointerEnter={(event) => updateBrushPreview(event)}
                                            onPointerLeave={() => {
                                                if (!drawingRef.current.active && !brushAdjustRef.current?.active) setBrushPreview(null);
                                            }}
                                            onContextMenu={(event) => event.preventDefault()}
                                        />
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>

                {brushPreview
                    ? createPortal(
                          <div
                              className={`pointer-events-none fixed z-[1100] rounded-full border-2 ${brushPreview.adjusting ? "border-[#fbbf24] bg-black/10" : "border-white/90 bg-black/5"} shadow-[0_0_0_1px_rgba(0,0,0,.8)]`}
                              style={{
                                  left: brushPreview.x,
                                  top: brushPreview.y,
                                  width: Math.max(4, brushPreview.size * viewport.imageScale),
                                  aspectRatio: 1,
                                  transform: "translate(-50%, -50%)",
                              }}
                          >
                              {brushPreview.adjusting ? (
                                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white">
                                      {brushSize}px
                                  </span>
                              ) : null}
                          </div>,
                          document.body,
                      )
                    : null}

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
                    <p className="m-0 text-[11px] leading-4 opacity-50">{t("canvas.editors.faceMeshBrushHint")}</p>

                    <div className="flex items-center gap-2">
                        <div className="grid flex-1 grid-cols-2 gap-1.5">
                            <Button size="small" type={mode === "paint" ? "primary" : "default"} icon={<Brush className="size-3.5" />} onClick={() => setMode("paint")}>
                                {t("canvas.editors.brush")}
                            </Button>
                            <Button size="small" type={mode === "erase" ? "primary" : "default"} icon={<Eraser className="size-3.5" />} onClick={() => setMode("erase")}>
                                {t("canvas.editors.erase")}
                            </Button>
                        </div>
                        <div className="flex items-center rounded-md border border-black/10 px-0.5 dark:border-white/10">
                            <Tooltip title={t("canvas.editors.undoMaskTitle")}>
                                <Button type="text" size="small" icon={<Undo2 className="size-3.5" />} disabled={!historySize} aria-label={t("canvas.editors.undoMask")} onClick={undoStroke} />
                            </Tooltip>
                            <Tooltip title={t("canvas.editors.redoMaskTitle")}>
                                <Button type="text" size="small" icon={<Redo2 className="size-3.5" />} disabled={!redoSize} aria-label={t("canvas.editors.redoMask")} onClick={redoStroke} />
                            </Tooltip>
                            <Tooltip title={t("canvas.editors.zoomOut")}>
                                <Button type="text" size="small" icon={<ZoomOut className="size-3.5" />} disabled={!viewport.canZoomOut} aria-label={t("canvas.editors.zoomOut")} onClick={viewport.zoomOut} />
                            </Tooltip>
                            <button type="button" className="min-w-11 px-0.5 text-center text-[11px] font-semibold tabular-nums opacity-70" onClick={viewport.resetZoom}>
                                {Math.round(viewport.zoom * 100)}%
                            </button>
                            <Tooltip title={t("canvas.editors.zoomIn")}>
                                <Button type="text" size="small" icon={<ZoomIn className="size-3.5" />} disabled={!viewport.canZoomIn} aria-label={t("canvas.editors.zoomIn")} onClick={viewport.zoomIn} />
                            </Tooltip>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-medium opacity-75">{t("canvas.editors.brushSize")}</span>
                            <span className="font-semibold tabular-nums">{brushSize}px</span>
                        </div>
                        <Slider min={8} max={160} step={2} value={brushSize} onChange={setBrushSize} />
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div className="space-y-1">
                            <div className="text-xs font-medium opacity-75">{t("canvas.editors.meshPattern")}</div>
                            <Segmented
                                size="small"
                                block
                                value={params.pattern}
                                options={patterns.map((pattern) => ({
                                    value: pattern,
                                    label: t(`canvas.editors.meshPattern_${pattern}`),
                                }))}
                                onChange={(value) => setParams((current) => ({ ...current, pattern: value as FaceMeshPattern }))}
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs font-medium opacity-75">{t("canvas.editors.meshColor")}</div>
                            <Segmented
                                size="small"
                                block
                                value={params.color}
                                options={[
                                    { value: "#0a0a0a", label: t("canvas.editors.meshColorBlack") },
                                    { value: "#1f2937", label: t("canvas.editors.meshColorGray") },
                                    { value: "#7f1d1d", label: t("canvas.editors.meshColorDarkRed") },
                                ]}
                                onChange={(value) => setParams((current) => ({ ...current, color: String(value) }))}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-medium opacity-75">
                            <span>{t("canvas.editors.meshDensity")}</span>
                            <span className="opacity-60">{densityLabel}</span>
                        </div>
                        <Slider
                            min={0.02}
                            max={0.09}
                            step={0.002}
                            value={0.11 - params.spacingRatio}
                            onChange={(value) => setParams((current) => ({ ...current, spacingRatio: Number((0.11 - Number(value)).toFixed(3)) }))}
                            tooltip={{ formatter: null }}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-x-3">
                        <div className="space-y-1">
                            <div className="text-xs font-medium opacity-75">{t("canvas.editors.meshLineWidth")}</div>
                            <Slider
                                min={0.002}
                                max={0.014}
                                step={0.0005}
                                value={params.lineWidthRatio}
                                onChange={(value) => setParams((current) => ({ ...current, lineWidthRatio: Number(value) }))}
                                tooltip={{ formatter: null }}
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs font-medium opacity-75">{t("canvas.editors.meshOpacity")}</div>
                            <Slider
                                min={0.25}
                                max={1}
                                step={0.01}
                                value={params.opacity}
                                onChange={(value) => setParams((current) => ({ ...current, opacity: Number(value) }))}
                                tooltip={{ formatter: (value) => `${Math.round(Number(value) * 100)}%` }}
                            />
                        </div>
                    </div>

                    {error ? <div className="text-xs font-medium text-[#ef4444]">{error}</div> : null}
                </div>
            </div>
        </Drawer>
    );
}

function readCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
}

function clampBrushSize(value: number) {
    return Math.min(160, Math.max(8, Math.round(value / 2) * 2));
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawBrushStroke(context: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
    if (from.x === to.x && from.y === to.y) {
        context.beginPath();
        context.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
        context.fill();
        return;
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
}

function configureStrokeContext(context: CanvasRenderingContext2D, stroke: MeshStroke) {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = stroke.size;
    context.globalCompositeOperation = stroke.mode === "paint" ? "source-over" : "destination-out";
    context.strokeStyle = "#000";
    context.fillStyle = "#000";
}

function canvasHasPaint(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 8) return true;
    }
    return false;
}
