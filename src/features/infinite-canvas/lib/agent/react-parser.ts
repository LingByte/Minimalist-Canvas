/**
 * ReAct text-protocol parser — fallback for models that don't support
 * native tool_calls. Parses "Action: name" + "Action Input: {json}" blocks.
 */

export type ReActCall = { name: string; args: Record<string, unknown> };

const ACTION_RE = /Action\s*:\s*`?([A-Za-z0-9_]+)`?[ \t]*\r?\n/g;
const SECTION_RE = /\r?\n(?:Thought|Action|Action Input|Observation|Final Answer|Final)\s*:/;

export function parseReActActions(text: string): ReActCall[] {
    const calls: ReActCall[] = [];
    let match;
    while ((match = ACTION_RE.exec(text))) {
        const name = match[1];
        const rest = text.slice(match.index + match[0].length);
        const inputMatch = /Action Input\s*:\s*([\s\S]*)/.exec(rest);
        if (!inputMatch) continue;
        let raw = inputMatch[1];
        const cut = raw.search(SECTION_RE);
        if (cut >= 0) raw = raw.slice(0, cut);
        calls.push({ name, args: parseJsonLenient(raw.trim()) });
    }
    return calls;
}

/** Remove Action/Action Input blocks so the visible bubble only shows Thought/Final text. */
export function stripReActBlocks(text: string): string {
    return text
        .replace(/Action\s*:\s*`?[A-Za-z0-9_]+`?[ \t]*\r?\n?Action Input\s*:\s*[\s\S]*?(?=\r?\n(?:Thought|Action|Observation|Final Answer|Final)\s*:|$)/g, "")
        .replace(/Final Answer\s*:\s*/g, "")
        .trim();
}

export function hasReActActions(text: string) {
    ACTION_RE.lastIndex = 0;
    return ACTION_RE.test(text);
}

/** Build the ReAct instructions appended to the system prompt in fallback mode. */
export function reactSystemPrompt(toolLines: string): string {
    return [
        "You can use tools by responding in this exact format:",
        "",
        "Thought: <your reasoning>",
        "Action: <tool_name>",
        "Action Input: <JSON object>",
        "",
        "After each Action you will receive: Observation: <tool result>.",
        "When the task is done, respond with:",
        "Final Answer: <your answer>",
        "",
        "Available tools:",
        toolLines,
    ].join("\n");
}

/** One-line-per-tool description for the ReAct prompt. */
export function describeToolsForReAct(tools: Array<{ function: { name: string; description?: string; parameters: Record<string, unknown> } }>): string {
    return tools
        .map((tool) => {
            const params = tool.function.parameters;
            const props = (params.properties && typeof params.properties === "object" ? Object.keys(params.properties as Record<string, unknown>) : []).join(", ");
            return `- ${tool.function.name}(${props}): ${tool.function.description || ""}`;
        })
        .join("\n");
}

function parseJsonLenient(raw: string): Record<string, unknown> {
    // Strip markdown fences
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        // Try to extract the first balanced {...} block
        const start = raw.indexOf("{");
        if (start < 0) return {};
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < raw.length; i++) {
            const ch = raw[i];
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === "\\") {
                escape = true;
                continue;
            }
            if (ch === '"') inString = !inString;
            if (inString) continue;
            if (ch === "{") depth += 1;
            if (ch === "}") {
                depth -= 1;
                if (depth === 0) {
                    try {
                        const parsed = JSON.parse(raw.slice(start, i + 1));
                        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
                    } catch {
                        return {};
                    }
                }
            }
        }
        return {};
    }
}
