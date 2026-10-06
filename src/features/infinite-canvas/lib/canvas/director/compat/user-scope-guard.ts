import { getActiveUserScope, getActiveUserScopeEpoch } from "@canvas/lib/canvas/director/compat/user-scope";

export type CapturedUserScope = {
    userScope: string;
    epoch: number;
};

export class UserScopeAbandonedError extends Error {
    constructor() {
        super("账号已切换，本次操作已停止");
        this.name = "UserScopeAbandonedError";
    }
}

export function captureUserScope(userScope = getActiveUserScope(), epoch = getActiveUserScopeEpoch()): CapturedUserScope {
    return { userScope, epoch };
}

export function userScopeMatches(expected: CapturedUserScope, live = captureUserScope()) {
    return expected.userScope === live.userScope && expected.epoch === live.epoch;
}

export function assertUserScope(expected: CapturedUserScope, live = captureUserScope()) {
    if (!userScopeMatches(expected, live)) throw new UserScopeAbandonedError();
}

export function isUserScopeAbandonedError(error: unknown): error is UserScopeAbandonedError {
    return error instanceof UserScopeAbandonedError || (error instanceof Error && error.name === "UserScopeAbandonedError");
}

export const userScopeRetryWait = {
    delay(ms: number) {
        if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
        });
    },
};

export function waitForRetryDelay(ms: number) {
    return userScopeRetryWait.delay(ms);
}
