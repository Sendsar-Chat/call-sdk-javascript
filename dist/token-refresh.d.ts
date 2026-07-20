import type { LiveKitCredentials } from "@sendsar/chat-sdk-javascript";
export type TokenRefreshScheduler = {
    reschedule(expiresAt: string): void;
    stop(): void;
};
type TimerHandle = ReturnType<typeof setTimeout>;
export declare function createTokenRefreshScheduler(options: {
    leadMs?: number;
    refresh: () => Promise<LiveKitCredentials>;
    onRefreshed: (credentials: LiveKitCredentials) => Promise<void>;
    onError: (error: unknown) => void;
    now?: () => number;
    setTimer?: (fn: () => void, delayMs: number) => TimerHandle;
    clearTimer?: (handle: TimerHandle) => void;
}): TokenRefreshScheduler;
export declare function tokenRefreshDelayMs(expiresAt: string, leadMs: number, nowMs: number): number | null;
export {};
//# sourceMappingURL=token-refresh.d.ts.map