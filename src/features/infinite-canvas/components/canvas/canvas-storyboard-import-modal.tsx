import { useMemo, useState } from "react";
import { Button, Input, Modal } from "antd";
import { Clapperboard } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { parseStoryboard } from "@canvas/lib/canvas/storyboard-import";

// Format demo — shown when users click "fill example", teaches the expected layout.
const STORYBOARD_EXAMPLE = `全局固定规则（所有镜头严格遵守）
1. 所有人物对白必须完整播放完毕，不得提前截断。每句台词按正常影视配音语速预留足够时间。
2. 同一段台词音频可持续跨多个镜号播放，画面可随意切换特写、远景，音频不中断。
3. 人物对白结束后，执行2秒画面缓冲，不切镜头、无新增动作。
4. 人物造型、服装、武器严格匹配参考素材，严格遵守时间轴秒数标注。
参考素材填写区
人物造型参考：图片 1
场景参考：图片 2
镜号 1｜
景别：特写
机位：平视正面
焦段/景深：85mm / 浅景深
运镜：缓慢推近
画面内容：昏暗工作室，主角凝视桌上的旧怀表，烛光在脸上跳动
动作流：手指轻触怀表边缘后缩回
台词：【主角：它又开始走了】
心理OS：十年了，它还认得我吗
视觉特效：怀表边缘泛起微光
环境音效：远处雨声
动作音效：金属轻响
镜号 2｜
景别：中景
机位：侧后方过肩
焦段/景深：35mm / 中景深
运镜：固定
画面内容：主角起身走向窗边，雨痕在玻璃上蜿蜒，城市灯火虚化成光斑
动作流：拉开窗帘一角，停顿，回望桌面
台词：【主角：如果它还在走，那他也一定还在等我】
心理OS：无
视觉特效：窗面倒影中叠加模糊的怀表齿轮
环境音效：雨声渐强、远处闷雷
动作音效：布料摩擦、窗帘滑轨声
镜号 3｜
景别：远景
机位：高角度俯拍
焦段/景深：24mm / 大景深
运镜：缓慢下降
画面内容：整间工作室全貌，主角独立窗前，城市天际线在雨幕中起伏
动作流：无
台词：无
心理OS：今夜必须出发
视觉特效：闪电瞬间照亮房间轮廓
环境音效：雷声轰鸣
动作音效：无`;

export function CanvasStoryboardImportModal({
    open,
    onClose,
    onImport,
}: {
    open: boolean;
    onClose: () => void;
    onImport: (text: string) => void;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [draft, setDraft] = useState("");

    const parsed = useMemo(() => parseStoryboard(draft), [draft]);
    const assetRefCount = useMemo(() => new Set([...parsed.preambleAssetRefs, ...parsed.shots.flatMap((shot) => shot.assetRefs)]).size, [parsed]);

    const close = () => {
        setDraft("");
        onClose();
    };

    return (
        <Modal
            title={
                <span className="inline-flex items-center gap-2">
                    <Clapperboard className="size-4" />
                    {t("canvas.storyboard.title")}
                </span>
            }
            open={open}
            centered
            width={720}
            onCancel={close}
            destroyOnHidden
            footer={[
                <Button key="cancel" onClick={close}>
                    {t("common.cancel")}
                </Button>,
                <Button key="import" type="primary" disabled={!parsed.shots.length} onClick={() => { onImport(draft); close(); }}>
                    {t("canvas.storyboard.import", { count: parsed.shots.length })}
                </Button>,
            ]}
        >
            <div data-canvas-no-zoom className="pt-2">
                <Input.TextArea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t("canvas.storyboard.placeholder")}
                    autoSize={{ minRows: 10, maxRows: 18 }}
                    className="thin-scrollbar !rounded-xl !text-[13px] !leading-6"
                    style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                />
                <div className="mt-2 flex items-center gap-3 px-1 text-xs" style={{ color: theme.node.muted }}>
                    <span>{t("canvas.storyboard.detected", { count: parsed.shots.length })}</span>
                    {assetRefCount ? <span>{t("canvas.storyboard.assetsDetected", { count: assetRefCount })}</span> : null}
                    {draft.trim() && !parsed.shots.length ? <span>{t("canvas.storyboard.noShots")}</span> : null}
                    <button type="button" className="ml-auto font-medium underline-offset-2 transition hover:underline" style={{ color: theme.node.muted }} onClick={() => setDraft(STORYBOARD_EXAMPLE)}>
                        {t("canvas.storyboard.fillExample")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
