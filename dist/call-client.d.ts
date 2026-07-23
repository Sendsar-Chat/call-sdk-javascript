import type { CallInviteEvent } from "@sendsar/protocol";
import type { CallRecord } from "@sendsar/chat-sdk-javascript";
import { EventEmitter } from "./events.js";
import type { CallClientEvent, CallClientEventMap, CallClientOptions, CallStartOptions, CallState } from "./types.js";
export declare class CallClient extends EventEmitter {
    private readonly signaling;
    private readonly media;
    private readonly debug;
    private state;
    private context;
    private pendingInvite;
    private signalingUnsubs;
    private destroyed;
    /** Bumped to cancel in-flight start/accept/join after hangup. */
    private callEpoch;
    /** True while we intentionally tear down media (hangup / finalize). */
    private tearingDown;
    constructor(options: CallClientOptions);
    get callState(): CallState;
    get activeCall(): CallRecord | null;
    get incomingInvite(): CallInviteEvent | null;
    /** Seconds before a ringing 1:1 call is treated as missed (from tenant settings). */
    get ringTimeoutSeconds(): number | null;
    on<E extends CallClientEvent>(event: E, handler: (payload: CallClientEventMap[E]) => void): () => void;
    /** Start a new call in a room (or rejoin via gateway when one is already active). */
    start(roomId: string, options: CallStartOptions): Promise<CallRecord>;
    /** Accept an incoming call by id (and optional room when not tracked from invite). */
    accept(callId: string, roomId?: string): Promise<CallRecord>;
    /** Decline a ringing call. */
    decline(callId?: string): Promise<CallRecord>;
    /**
     * Leave or end the active call.
     * Call creators use `endCall`; other participants use `leaveCall` (group-safe).
     */
    hangUp(options?: {
        reason?: "cancelled" | "no_answer";
    }): Promise<CallRecord | null>;
    setMicrophoneEnabled(enabled: boolean): Promise<void>;
    setCameraEnabled(enabled: boolean): Promise<void>;
    /** Resume media for the room's active call, if any. */
    rejoin(roomId: string): Promise<CallRecord | null>;
    /**
     * Tear down listeners and media.
     * Best-effort ends/leaves the active call so peers are not left ringing.
     */
    destroy(): void;
    /** Replay an invite that arrived before this client was constructed. */
    ingestInvite(payload: CallInviteEvent): void;
    private log;
    private isEpochCurrent;
    private assertReady;
    private requireUserId;
    private resolveInvite;
    private handleInvite;
    private joinMediaAfterAccept;
    private connectMedia;
    private handleMediaDisconnected;
    private teardownMedia;
    private finalizeCall;
    private transition;
}
//# sourceMappingURL=call-client.d.ts.map