import type { LiveKitCredentials } from "@sendsar/chat-sdk-javascript";
import { Room } from "livekit-client";
import type { CallTrackEvent } from "./types.js";
export type MediaSessionHandlers = {
    onLocalTrack: (event: CallTrackEvent) => void;
    onRemoteTrack: (event: CallTrackEvent) => void;
    onRemoteTrackRemoved: (event: CallTrackEvent) => void;
    onDisconnected: (reason?: string) => void;
    onReconnecting: () => void;
    onReconnected: () => void;
    onError: (error: unknown) => void;
};
export type MediaConnectOptions = {
    audio: boolean;
    video: boolean;
};
export type MediaSessionOptions = {
    createRoom?: () => Room;
    handlers: MediaSessionHandlers;
    debug?: boolean;
};
export declare class MediaSession {
    private readonly createRoom;
    private readonly handlers;
    private readonly debug;
    private room;
    private boundRoom;
    constructor(options: MediaSessionOptions);
    get isConnected(): boolean;
    get livekitRoom(): Room | null;
    connect(credentials: LiveKitCredentials, media: MediaConnectOptions): Promise<void>;
    private enableLocalMedia;
    setMicrophoneEnabled(enabled: boolean): Promise<void>;
    setCameraEnabled(enabled: boolean): Promise<void>;
    disconnect(): Promise<void>;
    private log;
    private bindRoomEvents;
    private unbindRoomEvents;
}
export declare function mediaFlagsForCallType(type: "audio" | "video"): MediaConnectOptions;
//# sourceMappingURL=media-session.d.ts.map