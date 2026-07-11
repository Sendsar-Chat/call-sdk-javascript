import { Room, RoomEvent, } from "livekit-client";
export class MediaSession {
    createRoom;
    handlers;
    room = null;
    boundRoom = null;
    constructor(options) {
        this.createRoom = options.createRoom ?? (() => new Room());
        this.handlers = options.handlers;
    }
    get isConnected() {
        return this.room?.state === "connected";
    }
    get livekitRoom() {
        return this.room;
    }
    async connect(credentials, media) {
        const room = this.room ?? this.createRoom();
        if (!this.room) {
            this.room = room;
            this.bindRoomEvents(room);
        }
        await room.connect(credentials.url, credentials.token, {
            autoSubscribe: true,
        });
        await room.localParticipant.setMicrophoneEnabled(media.audio);
        await room.localParticipant.setCameraEnabled(media.video);
    }
    async updateToken(credentials) {
        const room = this.room;
        if (!room)
            return;
        await room.connect(credentials.url, credentials.token);
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