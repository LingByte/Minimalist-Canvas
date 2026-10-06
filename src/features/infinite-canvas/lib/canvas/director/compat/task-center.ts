export type GenerationTask = {
    id: string;
    type?: string;
    status?: string;
    clientContext?: { source?: string; sceneId?: string };
};

export async function listGenerationTasks(): Promise<GenerationTask[]> {
    return [];
}

export async function queryGenerationTask(_id: string): Promise<GenerationTask | null> {
    return null;
}

export async function waitForGenerationTask(_task: unknown): Promise<GenerationTask> {
    throw new Error("当前画布暂不支持导演台 AI 全景图生成");
}
