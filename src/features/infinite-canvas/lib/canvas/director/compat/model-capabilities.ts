import type { AiConfig } from "@canvas/stores/use-config-store";

export function modelCapabilityConfigFor(_config: AiConfig, _model?: string) {
    return {
        image: {
            size: { allowCustom: true, values: ["2:1"], default: "2:1" },
            references: { maxImages: 4 },
        },
    };
}
