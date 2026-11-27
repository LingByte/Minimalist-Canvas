#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { douyinCheck, douyinLogin, douyinPublish, douyinSync } from "./platforms/douyin.ts";
import { kuaishouCheck, kuaishouLogin, kuaishouPublish, kuaishouSync } from "./platforms/kuaishou.ts";
import {
    xiaohongshuCheck,
    xiaohongshuLogin,
    xiaohongshuPublish,
    xiaohongshuSync,
} from "./platforms/xiaohongshu.ts";
import { emit, progress, type RunnerRequest } from "./shared.ts";

function readRequest(): RunnerRequest {
    const arg = process.argv[2];
    if (!arg) throw new Error("Missing request JSON (argv[2] or @path)");
    const raw = arg.startsWith("@") ? readFileSync(arg.slice(1), "utf8") : arg;
    return JSON.parse(raw) as RunnerRequest;
}

async function main() {
    const req = readRequest();
    progress(`ops ${req.command} / ${req.platform}`);

    let result: unknown;
    if (req.platform === "douyin") {
        if (req.command === "login") result = await douyinLogin(req);
        else if (req.command === "check") result = await douyinCheck(req);
        else if (req.command === "publish") result = await douyinPublish(req);
        else if (req.command === "sync") result = await douyinSync(req);
        else throw new Error(`Unknown command: ${req.command}`);
    } else if (req.platform === "kuaishou") {
        if (req.command === "login") result = await kuaishouLogin(req);
        else if (req.command === "check") result = await kuaishouCheck(req);
        else if (req.command === "publish") result = await kuaishouPublish(req);
        else if (req.command === "sync") result = await kuaishouSync(req);
        else throw new Error(`Unknown command: ${req.command}`);
    } else if (req.platform === "xiaohongshu") {
        if (req.command === "login") result = await xiaohongshuLogin(req);
        else if (req.command === "check") result = await xiaohongshuCheck(req);
        else if (req.command === "publish") result = await xiaohongshuPublish(req);
        else if (req.command === "sync") result = await xiaohongshuSync(req);
        else throw new Error(`Unknown command: ${req.command}`);
    } else {
        throw new Error(`Unknown platform: ${(req as RunnerRequest).platform}`);
    }

    emit("done", { result });
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    emit("error", { message });
    process.exitCode = 1;
});
