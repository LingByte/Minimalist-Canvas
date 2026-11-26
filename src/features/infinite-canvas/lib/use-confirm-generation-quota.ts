import { useCallback } from "react";

type ConfirmArgs = {
    modelValue: string;
    mode: "image" | "video" | "audio" | "text";
    count?: number;
    seconds?: number | string;
    resolution?: string;
};

/** Local-first: skip quota/pricing confirmation and always proceed. */
export function useConfirmGenerationQuota() {
    return useCallback(async (_args: ConfirmArgs) => true, []);
}
