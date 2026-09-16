/** Poll interval while waiting for async video tasks to complete. */
export const VIDEO_POLL_INTERVAL_MS = 5_000;

/** Max client wait time for video generation (create + poll). */
export const VIDEO_POLL_TIMEOUT_MS = 60 * 60 * 1_000;

export const VIDEO_POLL_MAX_ATTEMPTS = Math.ceil(VIDEO_POLL_TIMEOUT_MS / VIDEO_POLL_INTERVAL_MS);
