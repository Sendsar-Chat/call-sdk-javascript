const DEFAULT_LEAD_MS = 60_000;
const MIN_LEAD_MS = 5_000;
export function createTokenRefreshScheduler(options) {
    const leadMs = Math.max(options.leadMs ?? DEFAULT_LEAD_MS, MIN_LEAD_MS);
    const now = options.now ?? (() => Date.now());
    const setTimer = options.setTimer ?? ((fn, delayMs) => setTimeout(fn, delayMs));
    const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
    let timer = null;
    const stop = () => {
        if (timer) {
            clearTimer(timer);
            timer = null;
        }
    };
    const schedule = (expiresAt) => {
        stop();
        const expiresMs = Date.parse(expiresAt);
        if (Number.isNaN(expiresMs))
            return;
        const delay = Math.max(expiresMs - now() - leadMs, MIN_LEAD_MS);
        timer = setTimer(async () => {
            timer = null;
            try {
                const credentials = await options.refresh();
                await options.onRefreshed(credentials);
                schedule(credentials.expiresAt);
            }
            catch (error) {
                options.onError(error);
            }
        }, delay);
    };
    return {
        reschedule: schedule,
        stop,
    };
}
export function tokenRefreshDelayMs(expiresAt, leadMs, nowMs) {
    const expiresMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresMs))
        return null;
    return Math.max(expiresMs - nowMs - Math.max(leadMs, MIN_LEAD_MS), MIN_LEAD_MS);
}
//# sourceMappingURL=token-refresh.js.map