import { Room, RoomEvent, } from "livekit-client";
export class MediaSession {
    createRoom;
    handlers;
    debug;
    room = null;
    boundRoom = null;
    constructor(options) {
        this.createRoom = options.createRoom ?? (() => new Room());
        this.handlers = options.handlers;
        this.debug = options.debug ?? false;
    }
    get isConnected() {
        return this.room?.state === "connected";
    }
    get livekitRoom() {
        return this.room;
    }
    async connect(credentials, media) {
        // Always use a fresh Room for each connect — reusing a disconnected Room
        // can leave the engine half-dead and cause publish timeouts.
        if (this.room) {
            await this.disconnect();
        }
        const room = this.createRoom();
        this.room = room;
        this.bindRoomEvents(room);
        this.log("livekit connecting", {
            url: credentials.url,
            audio: media.audio,
            video: media.video,
        });
        // Warm DNS/TLS/WebRTC while we still can — speeds up first publish after accept.
        try {
            await room.prepareConnection(credentials.url, credentials.token);
        }
        catch {
            // optional optimization; connect() still works without it
        }
        await room.connect(credentials.url, credentials.token, {
            autoSubscribe: true,
        });
        this.log("livekit connected", {
            room: room.name,
            identity: room.localParticipant?.identity,
        });
        // Publish sequentially with one retry — LiveKit's publish ack timeout is ~10s.
        await this.enableLocalMedia(room, media, true);
        this.log("local media published", {
            room: room.name,
            mic: media.audio,
            camera: media.video,
        });
    }
    async enableLocalMedia(room, media, retry) {
        try {
            if (media.audio) {
                await room.localParticipant.setMicrophoneEnabled(true);
            }
            if (media.video) {
                await room.localParticipant.setCameraEnabled(true);
            }
        }
        catch (err) {
            this.log("enableLocalMedia failed", { retry, err });
            if (!retry) {
                throw err;
            }
            await new Promise((resolve) => setTimeout(resolve, 750));
            await this.enableLocalMedia(room, media, false);
        }
    }
    async setMicrophoneEnabled(enabled) {
        await this.room?.localParticipant.setMicrophoneEnabled(enabled);
    }
    async setCameraEnabled(enabled) {
        await this.room?.localParticipant.setCameraEnabled(enabled);
    }
    async disconnect() {
        const room = this.room;
        this.room = null;
        if (!room)
            return;
        if (this.boundRoom === room) {
            this.unbindRoomEvents(room);
            this.boundRoom = null;
        }
        if (room.state !== "disconnected") {
            await room.disconnect();
        }
    }
    log(...args) {
        if (this.debug) {
            console.info("[sendsar-call]", ...args);
        }
    }
    bindRoomEvents(room) {
        if (this.boundRoom === room)
            return;
        this.boundRoom = room;
        room.on(RoomEvent.LocalTrackPublished, (publication) => {
            const track = publication.track;
            if (!track)
                return;
            this.handlers.onLocalTrack({ track, publication });
        });
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            this.handlers.onRemoteTrack({ track, publication, participant });
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            this.handlers.onRemoteTrackRemoved({ track, publication, participant });
        });
        room.on(RoomEvent.Disconnected, (reason) => {
            this.handlers.onDisconnected(typeof reason === "string" ? reason : undefined);
        });
        room.on(RoomEvent.Reconnecting, () => {
            this.handlers.onReconnecting();
        });
        room.on(RoomEvent.Reconnected, () => {
            this.handlers.onReconnected();
        });
        room.on(RoomEvent.MediaDevicesError, (error) => {
            this.handlers.onError(error);
        });
    }
    unbindRoomEvents(room) {
        room.removeAllListeners(RoomEvent.LocalTrackPublished);
        room.removeAllListeners(RoomEvent.TrackSubscribed);
        room.removeAllListeners(RoomEvent.TrackUnsubscribed);
        room.removeAllListeners(RoomEvent.Disconnected);
        room.removeAllListeners(RoomEvent.Reconnecting);
        room.removeAllListeners(RoomEvent.Reconnected);
        room.removeAllListeners(RoomEvent.MediaDevicesError);
    }
}
export function mediaFlagsForCallType(type) {
    return type === "video" ? { audio: true, video: true } : { audio: true, video: false };
}
//# sourceMappingURL=media-session.js.map