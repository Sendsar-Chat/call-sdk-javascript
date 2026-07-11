import { createCallSignaling } from "@sendsar/chat-sdk-javascript/call-signaling";
import { EventEmitter } from "./events.js";
import { MediaSession, mediaFlagsForCallType } from "./media-session.js";
import { bindCallSignaling, unbindCallSignaling } from "./signaling.js";
import { assertTransition, isInCallState } from "./state-machine.js";
import { createTokenRefreshScheduler } from "./token-refresh.js";
export class CallClient extends EventEmitter {
    signaling;
    tokenRefreshLeadMs;
    media;
    state = "idle";
    context = null;
    pendingInvite = null;
    signalingUnsubs = null;
    tokenScheduler = null;
    destroyed = false;
    constructor(options) {
        super();
        this.signaling = options.signaling ?? createCallSignaling(options.chat);
        this.tokenRefreshLeadMs = options.tokenRefreshLeadMs ?? 60_000;
        this.media = new MediaSession({
            createRoom: options.createRoom,
            handlers: {
                onLocalTrack: (event) => this.emit("localTrack", event),
                onRemoteTrack: (event) => this.emit("remoteTrack", event),
                onRemoteTrackRemoved: (event) => this.emit("remoteTrackRemoved", event),
                onDisconnected: (reason) => {
                    void this.handleMediaDisconnected(reason);
                },
                onReconnecting: () => {
                    if (this.context) {
                        this.emit("mediaReconnecting", { call: this.context.call });
                    }
                },
                onReconnected: () => {
                    if (this.context) {
                        this.emit("mediaReconnected", { call: this.context.call });
                    }
                },
                onError: (cause) => {
                    this.emit("error", { message: "Media device error", cause });
                },
            },
        });
        this.signalingUnsubs = bindCallSignaling(this.signaling, {
            onInvite: (payload) => this.handleInvite(payload),
            onAccepted: (payload) => {
                this.emit("accepted", payload);
                if (this.context?.call.id === payload.callId && this.state === "outgoing") {
                    this.transition("active");
                }
            },
            onDeclined: (payload) => {
                this.emit("declined", payload);
                if (this.context?.call.id === payload.callId) {
                    void this.finalizeCall("declined");
                }
            },
            onEnded: (payload) => {
                this.emit("ended", payload);
                if (this.context?.call.id === payload.callId || this.pendingInvite?.callId === payload.callId) {
                    void this.finalizeCall(payload.reason ?? "ended");
                }
            },
        });
    }
    get callState() {
        return this.state;
    }
    get activeCall() {
        return this.context?.call ?? null;
    }
    get incomingInvite() {
        return this.pendingInvite;
    }
    /** Seconds before a ringing 1:1 call is treated as missed (from tenant settings). */
    get ringTimeoutSeconds() {
        return this.context?.ringTimeoutSeconds ?? null;
    }
    on(event, handler) {
        return super.on(event, handler);
    }
    /** Start a new call in a room (or rejoin via gateway when one is already active). */
    async start(roomId, options) {
        this.assertReady();
        if (isInCallState(this.state)) {
            throw new Error("Already in a call");
        }
        const result = await this.signaling.startCall(roomId, { type: options.type });
        this.context = {
            call: result.call,
            livekit: result.livekit,
            ringTimeoutSeconds: result.ringTimeoutSeconds,
        };
        this.pendingInvite = null;
        this.transition("outgoing");
        await this.connectMedia(result.livekit, options.type);
        return result.call;
    }
    /** Accept an incoming call by id (and optional room when not tracked from invite). */
    async accept(callId, roomId) {
        this.assertReady();
        const resolvedRoomId = roomId ?? this.pendingInvite?.roomId ?? this.context?.call.roomId;
        if (!resolvedRoomId) {
            throw new Error("roomId is required to accept a call");
        }
        if (this.pendingInvite && this.pendingInvite.callId !== callId) {
            throw new Error("Another incoming call is pending");
        }
        const result = await this.signaling.acceptCall(resolvedRoomId, callId);
        this.context = {
            call: result.call,
            livekit: result.livekit,
            ringTimeoutSeconds: result.ringTimeoutSeconds,
            invite: this.pendingInvite ?? undefined,
        };
        this.pendingInvite = null;
        this.transition("connecting");
        await this.connectMedia(result.livekit, result.call.type);
        return result.call;
    }
    /** Decline a ringing call. */
    async decline(callId) {
        this.assertReady();
        const invite = this.resolveInvite(callId);
        const record = await this.signaling.declineCall(invite.roomId, invite.callId);
        if (this.pendingInvite?.callId === invite.callId) {
            this.pendingInvite = null;
        }
        await this.finalizeCall("declined");
        return record;
    }
    /**
     * Leave or end the active call.
     * Call creators use `endCall`; other participants use `leaveCall` (group-safe).
     */
    async hangUp(options) {
        this.assertReady();
        const ctx = this.context;
        if (!ctx)
            return null;
        const userId = this.requireUserId();
        const { call } = ctx;
        const record = call.createdByUserId === userId
            ? await this.signaling.endCall(call.roomId, call.id, options)
            : await this.signaling.leaveCall(call.roomId, call.id);
        await this.teardownMedia();
        this.transition("ended");
        this.context = null;
        this.transition("idle");
        return record;
    }
    async setMicrophoneEnabled(enabled) {
        await this.media.setMicrophoneEnabled(enabled);
    }
    async setCameraEnabled(enabled) {
        await this.media.setCameraEnabled(enabled);
    }
    /** Resume media for the room's active call, if any. */
    async rejoin(roomId) {
        this.assertReady();
        if (isInCallState(this.state)) {
            throw new Error("Already in a call");
        }
        const call = await this.signaling.getActiveCall(roomId);
        if (!call)
            return null;
        const refreshed = await this.signaling.refreshCallToken(roomId, call.id);
        this.context = {
            call,
            livekit: refreshed.livekit,
        };
        this.transition("connecting");
        await this.connectMedia(refreshed.livekit, call.type);
        return call;
    }
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        unbindCallSignaling(this.signalingUnsubs);
        this.signalingUnsubs = null;
        this.stopTokenRefresh();
        void this.teardownMedia();
        this.context = null;
        this.pendingInvite = null;
        this.transition("idle");
        this.removeAllListeners();
    }
    assertReady() {
        if (this.destroyed) {
            throw new Error("CallClient has been destroyed");
        }
        if (!this.signaling.isConnected) {
            throw new Error("Chat client is not connected — call connect() first");
        }
    }
    requireUserId() {
        const userId = this.signaling.currentUserId;
        if (!userId) {
            throw new Error("Chat client is not connected — call connect() first");
        }
        return userId;
    }
    resolveInvite(callId) {
        if (callId) {
            if (this.pendingInvite?.callId === callId) {
                return this.pendingInvite;
            }
            if (this.context?.call.id === callId && this.context.invite) {
                return this.context.invite;
            }
            throw new Error("Unknown call id");
        }
        if (!this.pendingInvite) {
            throw new Error("No incoming call to decline");
        }
        return this.pendingInvite;
    }
    handleInvite(payload) {
        if (this.context?.call.id === payload.callId)
            return;
        if (isInCallState(this.state) && this.context?.call.roomId !== payload.roomId) {
            return;
        }
        this.pendingInvite = payload;
        if (this.state === "idle") {
            this.transition("incoming");
        }
        this.emit("incoming", payload);
    }
    async connectMedia(livekit, type) {
        try {
            await this.media.connect(livekit, mediaFlagsForCallType(type));
            this.startTokenRefresh(livekit.expiresAt);
            if (this.state === "outgoing" || this.state === "connecting") {
                this.transition("active");
            }
            if (this.context) {
                this.emit("mediaConnected", { call: this.context.call });
            }
        }
        catch (cause) {
            this.emit("error", { message: "Failed to connect call media", cause });
            await this.finalizeCall("media_error");
            throw cause;
        }
    }
    startTokenRefresh(expiresAt) {
        const ctx = this.context;
        if (!ctx)
            return;
        this.stopTokenRefresh();
        this.tokenScheduler = createTokenRefreshScheduler({
            leadMs: this.tokenRefreshLeadMs,
            refresh: async () => {
                const refreshed = await this.signaling.refreshCallToken(ctx.call.roomId, ctx.call.id);
                this.context = { ...ctx, livekit: refreshed.livekit };
                return refreshed.livekit;
            },
            onRefreshed: async (credentials) => {
                await this.media.updateToken(credentials);
            },
            onError: (cause) => {
                this.emit("error", { message: "Failed to refresh call token", cause });
            },
        });
        this.tokenScheduler.reschedule(expiresAt);
    }
    stopTokenRefresh() {
        this.tokenScheduler?.stop();
        this.tokenScheduler = null;
    }
    async handleMediaDisconnected(reason) {
        if (!this.context || this.state === "idle" || this.state === "ended")
            return;
        this.emit("mediaDisconnected", { call: this.context.call, reason });
    }
    async teardownMedia() {
        this.stopTokenRefresh();
        await this.media.disconnect();
    }
    async finalizeCall(reason) {
        const call = this.context?.call ?? null;
        await this.teardownMedia();
        if (this.pendingInvite && call && this.pendingInvite.callId === call.id) {
            this.pendingInvite = null;
        }
        this.context = null;
        if (this.state !== "idle") {
            this.transition("ended");
            this.transition("idle");
        }
        if (call) {
            this.emit("mediaDisconnected", { call, reason });
        }
    }
    transition(to) {
        const from = this.state;
        if (from === to)
            return;
        assertTransition(from, to);
        this.state = to;
        this.emit("stateChange", { from, to, call: this.context?.call ?? null });
    }
}
//# sourceMappingURL=call-client.js.map