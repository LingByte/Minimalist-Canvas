export type PortraitStyleId = "pencil" | "watercolor" | "retouch";

export type PortraitStylePreset = {
    id: PortraitStyleId;
    /** Fixed Chinese edit prompt sent to the image model. */
    prompt: string;
};

/** Face-pass / portrait restyle prompts used for image edit. */
export const PORTRAIT_STYLE_PRESETS: PortraitStylePreset[] = [
    {
        id: "pencil",
        prompt:
            "将这张人物照片转换为细腻的彩色铅笔手绘插画。保留人物的身份特征、五官比例、表情、发型、姿态和服装细节，保留原始构图。使用自然柔和的色彩、可见但细腻的彩铅笔触与轻微纸张纹理。不要添加文字、水印、额外人物或多余物体。",
    },
    {
        id: "watercolor",
        prompt:
            "将参考照片转换为柔和的水彩插画。保持人物五官比例、发型、服装、姿势和原有构图，保留产品形状与关键细节。使用清透自然的色彩、轻柔晕染与细微纸张肌理，人物轮廓清晰。不添加文字、水印或额外人物。",
    },
    {
        id: "retouch",
        prompt:
            "在保留人物五官、发型、服装、姿势及产品关键细节的前提下，改善画面清晰度、光线与色彩。保持自然真实的肤色和合理身体结构，沿用原有构图及背景。不添加文字、水印或额外人物。",
    },
];

export function getPortraitStylePreset(id: PortraitStyleId): PortraitStylePreset {
    return PORTRAIT_STYLE_PRESETS.find((item) => item.id === id) || PORTRAIT_STYLE_PRESETS[0];
}
