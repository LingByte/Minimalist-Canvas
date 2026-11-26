import i18n from "@canvas/i18n";
import { CHARACTER_ASSET_SHEET_PROMPT } from "@canvas/services/api/builtin-prompt-templates";
import { requestImageQuestion, type AiTextMessage } from "@canvas/services/api/image";
import { resolveModelForCapability, type AiConfig } from "@canvas/stores/use-config-store";
import type { CanvasResourceReference } from "@canvas/lib/canvas/canvas-resource-references";
import type { CanvasGenerationMode } from "@canvas/types/canvas";

export type OptimizablePromptMode = Extract<CanvasGenerationMode, "image" | "video" | "audio">;

export type PromptOptimizePreset = "default" | "character-asset-sheet";

export type PromptOptimizeInput = {
    mode: OptimizablePromptMode;
    draft: string;
    /** Target duration for video storyboards — decides how many shots the spec needs. */
    seconds?: number;
    /** Connected canvas assets the optimized prompt may cite by label. */
    references?: CanvasResourceReference[];
    /** Optional user critique: only fix these issues, keep the rest. */
    feedback?: string;
    /** When refining, the previous optimizer output becomes the base draft. */
    previousResult?: string;
    /** Structural template to fill / enforce. */
    preset?: PromptOptimizePreset;
};

// Fixed production spec the user provided — keep structure and field names verbatim.
const VIDEO_STORYBOARD_SPEC = `全局固定规则（所有镜头严格遵守）
1. 所有人物对白必须完整播放完毕，不得提前截断。每句台词按正常影视配音语速预留足够时间，长句、低语、怒吼台词保留情绪停顿。
2. 同一段台词音频可持续跨多个镜号播放，画面可随意切换特写、远景，音频不中断。
3. 人物对白结束后，执行2秒画面缓冲，缓冲阶段人物、姿态、光影、环境稳定，不切镜头、无新增动作。
4. 人物造型、服装、武器严格匹配参考素材，严格遵守时间轴秒数标注。
参考素材填写区
人物造型参考：
场景参考：
镜号 N｜
景别：【自定义填写】
机位：【自定义填写】
焦段/景深：【自定义填写/无】
运镜：【自定义填写/无】
画面内容：【自定义描述画面、环境、人物状态】
动作流：【自定义填写/无】
台词：【角色：台词内容/无】
心理OS：【自定义内容/无】
视觉特效：【自定义内容/无】
环境音效：【自定义音效/无】
动作音效：【自定义音效/无】`;

function referenceBlock(references: CanvasResourceReference[] | undefined) {
    const lines = (references || [])
        .filter((reference) => reference.active)
        .map((reference) => `- ${reference.label}: ${reference.title}`);
    return lines.length ? `\n\nConnected canvas assets (cite them by label inside the prompt):\n${lines.join("\n")}` : "";
}

function feedbackBlock(feedback: string | undefined) {
    const text = feedback?.trim();
    if (!text) return "";
    return `\n\nUser feedback (priority — only change what is needed to address these points; keep everything else):\n${text}`;
}

const OPTIMIZER_SYSTEM: Record<OptimizablePromptMode, (input: PromptOptimizeInput) => string> = {
    image: (input) => {
        if (input.preset === "character-asset-sheet") {
            return `你是角色资产设定图提示词工程师。把用户的草稿改写成下方模板的完整生图提示词，填满所有 {占位符}，保留模板分区结构与中文标签原文。

<template>
${CHARACTER_ASSET_SHEET_PROMPT}
</template>

规则：
- 严格保留模板的章节标题、分区布局要求、表情顺序与质量约束。
- 用用户草稿里的角色信息替换全部 {占位符}；草稿未给出的字段，按角色气质合理补全，不要留下花括号占位符。
- 若提供了用户反馈：只针对反馈修改，其余措辞与设定尽量保持上一版结果。
- 输出语言与用户草稿一致（通常为中文）。
- 只输出最终提示词正文，不要解释、不要 markdown、不要代码块。${feedbackBlock(input.feedback)}${referenceBlock(input.references)}`;
        }
        return `You are a prompt engineer for text-to-image generation. Rewrite the user's rough idea into one refined generation prompt.
Rules:
- Keep the user's intent and answer in the same language as their draft.
- Make it concrete and visual: subject, action, environment, composition, lighting, color palette, style, camera/lens, quality cues — only details that help the renderer.
- Keep every asset reference label (e.g. 图片 N / Image N) verbatim so existing bindings stay intact.
- If user feedback is provided, only change what is needed to address it; keep the rest stable.
- Output only the final prompt text — no explanations, no markdown, no quotes.${feedbackBlock(input.feedback)}${referenceBlock(input.references)}`;
    },
    video: (input) => `你是一名导演级分镜脚本撰写助手。把用户的粗略创意改写为下面的分镜表，逐字保留其结构、字段名与全局固定规则原文：

<spec>
${VIDEO_STORYBOARD_SPEC}
</spec>

要求：
- 开头原样输出"全局固定规则"四条与"参考素材填写区"标题，不得改写或删节。
- "人物造型参考 / 场景参考"按下方已连接的画布资产填写（引用其编号与名称）；无素材填"无"。
- 镜号按成片时长安排：总时长约 ${input.seconds ?? 8} 秒，每镜约 3–8 秒，镜号连续编号（镜号 1、镜号 2…），含对白的镜头按规则 1–3 预留时间。
- 将每个【自定义…】占位替换为具体、可拍的内容；不适用字段按模板要求写"无"。
- 分镜表字段名与全局规则保持原文，内容描述使用与用户草稿相同的语言。
- 若提供了用户反馈：只针对反馈修改，其余镜头尽量保持。
- 只输出填好的分镜表，不要解释、不要代码块。${feedbackBlock(input.feedback)}${referenceBlock(input.references)}`,
    audio: (input) => `You are a prompt engineer for audio/music generation. Rewrite the user's rough idea into one refined generation prompt.
Rules:
- Keep the user's intent and answer in the same language as their draft.
- Make it concrete: genre, mood, tempo, instrumentation, vocals, structure, mix/texture — only details that help the renderer.
- Keep every asset reference label verbatim so existing bindings stay intact.
- If user feedback is provided, only change what is needed to address it; keep the rest stable.
- Output only the final prompt text — no explanations, no markdown, no quotes.${feedbackBlock(input.feedback)}${referenceBlock(input.references)}`,
};

export function buildPromptOptimizeMessages(input: PromptOptimizeInput): AiTextMessage[] {
    const base = input.previousResult?.trim() || input.draft;
    const userParts = [`Current prompt:\n${base}`];
    if (input.previousResult?.trim() && input.draft.trim() && input.draft.trim() !== input.previousResult.trim()) {
        userParts.unshift(`Original user idea:\n${input.draft.trim()}`);
    }
    if (input.feedback?.trim()) {
        userParts.push(`Feedback:\n${input.feedback.trim()}`);
    }
    return [
        { role: "system", content: OPTIMIZER_SYSTEM[input.mode](input) },
        { role: "user", content: userParts.join("\n\n") },
    ];
}

/** Rewrite a composer draft with the configured text model; streams the rewrite via onDelta. */
export async function optimizeCanvasPrompt(
    config: AiConfig,
    input: PromptOptimizeInput,
    onDelta: (text: string) => void,
    options?: { signal?: AbortSignal },
): Promise<string> {
    const model = resolveModelForCapability(config, undefined, "text");
    const messages = buildPromptOptimizeMessages(input);
    const answer = await requestImageQuestion({ ...config, model }, messages, onDelta, options);
    const text = answer.trim();
    // The request layer maps empty completions to the localized "no content" placeholder — never persist that as a prompt.
    return text === i18n.t("apiErrors.noContent") ? "" : text;
}
