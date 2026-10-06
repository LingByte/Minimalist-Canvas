import type { AiConfig } from "@canvas/stores/use-config-store";

export function resolveCanvasGenerationModel(config: AiConfig, preferred?: string, _capability?: string) {
    return preferred || config.imageModel || config.model;
}
