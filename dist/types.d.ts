import type { CallAcceptedEvent, CallDeclinedEvent, CallEndedEvent, CallInviteEvent } from "@sendsar/protocol";
import type { CallRecord, CallType, LiveKitCredentials, SendsarClient } from "@sendsar/chat-sdk-javascript";
import type { CallSignaling } from "@sendsar/chat-sdk-javascript/call-signaling";
import type { LocalTrackPublication, RemoteParticipant, RemoteTrackPublication, Room, Track } from "livekit-client";
export type CallState = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";
export type CallClientOptions = {
    /** Connected `SendsarClient` from `@sendsar/chat-sdk-javascript` (call `connect()` first). */
    chat: SendsarClient;
    /** Override signaling adapter (tests). */
    signaling?: CallSignaling;
    /** Inject a Room factory (tests). */
    createRoom?: () => Room;
    /** Log invite/media lifecycle to the console. Default false. */
    debug?: boolean;
};
export type CallStartOptions = {
    type: CallType;
};
export type CallStateChangeEvent = {
    from: CallState;
    to: CallState;
    call: CallRecord | null;
};
export type CallTrackEvent = {
    track: Track;
    publication: LocalTrackPublication | RemoteTrackPublication;
    participant?: RemoteParticipant;
};
export type CallErrorEvent = {
    message: string;
    cause?: unknown;
};
export type CallClientEventMap = {
    stateChange: CallStateChangeEvent;
    incoming: CallInviteEvent;
    accepted: CallAcceptedEvent;
    declined: CallDeclinedEvent;
    ended: CallEndedEvent;
    localTrack: CallTrackEvent;
    remoteTrack: CallTrackEvent;
    remoteTrackRemoved: CallTrackEvent;
    mediaConnected: {
        call: CallRecord;
    };
    mediaDisconnected: {
        call: CallRecord | null;
        reason?: string;
    };
    mediaReconnecting: {
        call: CallRecord;
    };
    mediaReconnected: {
        call: CallRecord;
    };
    error: CallErrorEvent;
};
export type CallClientEvent = keyof CallClientEventMap;
export type ActiveCallContext = {
    call: CallRecord;
    livekit: LiveKitCredentials;
    ringTimeoutSeconds?: number;
    invite?: CallInviteEvent;
};
//# sourceMappingURL=types.d.ts.map