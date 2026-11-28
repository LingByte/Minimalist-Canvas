import { nanoid } from "nanoid";

import { BUILTIN_PROMPT_SOURCE_ID, BUILTIN_PROMPT_SOURCE_URL } from "./builtin-prompt-templates";

export type PromptSource = {
    id: string;
    name: string;
    url: string;
    homepage: string;
    enabled: boolean;
    builtIn: boolean;
};

const PROMPT_REGISTRY_SOURCE_BASE =
    "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources";

export function createPromptSource(source?: Partial<PromptSource>): PromptSource {
    return {
        id: source?.id?.trim() || nanoid(),
        name: source?.name?.trim() || "",
        url: source?.url?.trim() || "",
        homepage: source?.homepage?.trim() || "",
        enabled: source?.enabled ?? true,
        builtIn: source?.builtIn ?? false,
    };
}

export const DEFAULT_PROMPT_SOURCES: PromptSource[] = [
    {
        id: BUILTIN_PROMPT_SOURCE_ID,
        name: "至简画布模板",
        url: BUILTIN_PROMPT_SOURCE_URL,
        homepage: "",
        enabled: true,
        builtIn: true,
    },
    registrySource("banana-prompt-quicker", "Banana Prompt Quicker", "https://glidea.github.io/banana-prompt-quicker/"),
    registrySource("davidwu-gpt-image2-prompts", "DavidWu GPT Image 2", "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts"),
    registrySource("freestylefly-gpt-image-2", "Freestylefly GPT Image 2", "https://github.com/freestylefly/awesome-gpt-image-2"),
    registrySource("awesome-gpt-image", "Awesome GPT Image", "https://github.com/ZeroLu/awesome-gpt-image"),
    registrySource("awesome-gpt4o-image-prompts", "Awesome GPT-4o", "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts"),
    registrySource("youmind-gpt-image-2", "YouMind GPT Image 2", "https://github.com/YouMind-OpenLab/awesome-gpt-image-2"),
    registrySource("youmind-nano-banana-pro", "YouMind Nano Banana Pro", "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts"),
    remoteSource(
        "toolcentral-gpt-image-2-5",
        "Toolcentral GPT Image 2.5",
        "https://raw.githubusercontent.com/Toolcentral-ai/awesome-gpt-image-2-5-prompts/main/data/gpt-image-2-5-prompts.json",
        "https://github.com/Toolcentral-ai/awesome-gpt-image-2-5-prompts",
    ),
    remoteSource(
        "youart-gpt-image-2-5",
        "YouArt GPT Image 2.5",
        "https://raw.githubusercontent.com/youart-open-source/awesome-gpt-image-2-5-prompts/main/data/prompts.json",
        "https://github.com/youart-open-source/awesome-gpt-image-2-5-prompts",
    ),
    remoteSource(
        "nexra-ai-image-prompts",
        "NeXra AI Image Prompts",
        "https://raw.githubusercontent.com/NeXra-AI/awesome-ai-image-prompts/main/data/prompts.json",
        "https://github.com/NeXra-AI/awesome-ai-image-prompts",
    ),
    remoteSource(
        "reviral-gpt-image-prompts",
        "Reviral GPT Image Prompts",
        "https://raw.githubusercontent.com/Reviral-ai/gpt-image-prompts/main/data/prompts.json",
        "https://github.com/Reviral-ai/gpt-image-prompts",
    ),
    remoteSource(
        "imgedify-nano-banana-pro",
        "ImgEdify Nano Banana Pro",
        "https://raw.githubusercontent.com/ImgEdify/awesome-nano-banana-pro-prompts/main/data/prompts.json",
        "https://github.com/ImgEdify/awesome-nano-banana-pro-prompts",
    ),
    remoteSource(
        "aigc-hackers-claude-image-prompts",
        "AIGC Hackers Image Prompts",
        "https://raw.githubusercontent.com/AIGC-Hackers/awesome-ai-image-prompts-claude/main/data/prompts.json",
        "https://github.com/AIGC-Hackers/awesome-ai-image-prompts-claude",
    ),
];

function registrySource(id: string, name: string, homepage: string): PromptSource {
    return {
        id,
        name,
        url: `${PROMPT_REGISTRY_SOURCE_BASE}/${id}.json`,
        homepage,
        enabled: true,
        builtIn: true,
    };
}

function remoteSource(id: string, name: string, url: string, homepage: string): PromptSource {
    return {
        id,
        name,
        url,
        homepage,
        enabled: true,
        builtIn: true,
    };
}
