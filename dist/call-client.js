import { createCallSignaling } from "@sendsar/chat-sdk-javascript/call-signaling";
import { EventEmitter } from "./events.js";
import { MediaSession, mediaFlagsForCallType } from "./media-session.js";
import { bindCallSignaling, unbindCallSignaling } from "./signaling.js";
import { assertTransition, isInCallState } from "./state-machine.js";
export class CallClient extends EventEmitter {
    signaling;
    media;
    debug;
    state = "idle";
    context = null;
    pendingInvite = null;
    signalingUnsubs = null;
    destroyed = false;
    /** Bumped to cancel in-flight start/accept/join after hangup. */
    callEpoch = 0;
    /** True while we intentionally tear down media (hangup / finalize). */
    tearingDown = false;
    constructor(options) {
        super();
        this.signaling = options.signaling ?? createCallSignaling(options.chat);
        this.debug = options.debug ?? false;
        this.media = new MediaSession({
            createRoom: options.createRoom,
            debug: this.debug,
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
            onInvite: (payload) => {
                this.log("invite received", payload);
                this.handleInvite(payload);
            },
            onAccepted: (payload) => {
                this.log("accepted received", payload, { state: this.state });
                this.emit("accepted", payload);
                if (this.context?.call.id === payload.callId && this.state === "outgoing") {
                    // Join LiveKit only after the peer accepts — avoids publishing into an
                    // empty room during ring (publish timeouts / webhook empty-room races).
                    void this.joinMediaAfterAccept();
                }
            },
            onDeclined: (payload) => {
                this.log("declined received", payload);
                this.emit("declined", payload);
                if (this.context?.call.id === payload.callId) {
                    void this.finalizeCall("declined");
                }
            },
            onEnded: (payload) => {
                this.log("ended received", payload, { state: this.state });
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
        const epoch = ++this.callEpoch;
        // Optimistic UI: show outgoing immediately while the start API is in flight.
        this.transition("outgoing");
        try {
            const result = await this.signaling.startCall(roomId, { type: options.type });
            if (!this.isEpochCurrent(epoch) || this.state !== "outgoing") {
                // User cancelled while the start request was in flight.
                try {
                    await this.signaling.endCall(result.call.roomId, result.call.id, { reason: "cancelled" });
                }
                catch {
                    // ignore — call may already be gone
                }
                return result.call;
            }
            this.context = {
                call: result.call,
                livekit: result.livekit,
                ringTimeoutSeconds: result.ringTimeoutSeconds,
            };
            this.pendingInvite = null;
            // Rejoins (and any call already ACTIVE) connect media immediately.
            // RINGING (1:1 and group) waits for call-accepted before joining LiveKit.
            if (result.call.status === "active") {
                this.transition("connecting");
                await this.connectMedia(result.livekit, options.type, epoch);
            }
            return result.call;
        }
        catch (cause) {
            if (this.isEpochCurrent(epoch)) {
                await this.finalizeCall("start_failed");
            }
            throw cause;
        }
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
        const invite = this.pendingInvite;
        const epoch = ++this.callEpoch;
        // Optimistic UI: leave ringing controls as soon as Accept is pressed.
        if (this.state === "incoming") {
            this.transition("connecting");
        }
        try {
            const result = await this.signaling.acceptCall(resolvedRoomId, callId);
            if (!this.isEpochCurrent(epoch)) {
                // Hangup during accept — best-effort leave so the peer is not left hanging.
                try {
                    await this.signaling.leaveCall(resolvedRoomId, callId);
                }
                catch {
                    // ignore
                }
                return result.call;
            }
            this.context = {
                call: result.call,
                livekit: result.livekit,
                ringTimeoutSeconds: result.ringTimeoutSeconds,
                invite: invite ?? undefined,
            };
            this.pendingInvite = null;
            if (this.state !== "connecting") {
                this.transition("connecting");
            }
            await this.connectMedia(result.livekit, result.call.type, epoch);
            return result.call;
        }
        catch (cause) {
            if (this.isEpochCurrent(epoch)) {
                this.emit("error", { message: "Failed to accept call", cause });
                await this.finalizeCall("accept_failed");
            }
            throw cause;
        }
    }
    /** Decline a ringing call. */
    async decline(callId) {
        this.assertReady();
        const invite = this.resolveInvite(callId);
        this.callEpoch += 1;
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
        this.callEpoch += 1;
        const ctx = this.context;
        if (!ctx) {
            // Cancel optimistic dialing (start/accept API still in flight).
            if (this.state === "outgoing" || this.state === "connecting" || this.state === "incoming") {
                this.pendingInvite = null;
                this.transition("ended");
                this.transition("idle");
            }
            return null;
        }
        const userId = this.requireUserId();
        const { call } = ctx;
        const record = call.createdByUserId === userId
            ? await this.signaling.endCall(call.roomId, call.id, options)
            : await this.signaling.leaveCall(call.roomId, call.id);
        await this.teardownMedia();
        this.context = null;
        this.pendingInvite = null;
        if (this.state !== "idle") {
            this.transition("ended");
            this.transition("idle");
        }
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
        const epoch = ++this.callEpoch;
        const refreshed = await this.signaling.refreshCallToken(roomId, call.id);
        if (!this.isEpochCurrent(epoch))
            return null;
        this.context = {
            call,
            livekit: refreshed.livekit,
        };
        this.transition("connecting");
        await this.connectMedia(refreshed.livekit, call.type, epoch);
        return call;
    }
    /**
     * Tear down listeners and media.
     * Best-effort ends/leaves the active call so peers are not left ringing.
     */
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.callEpoch += 1;
        unbindCallSignaling(this.signalingUnsubs);
        this.signalingUnsubs = null;
        const ctx = this.context;
        if (ctx && this.signaling.isConnected) {
            const userId = this.signaling.currentUserId;
            const end = userId && ctx.call.createdByUserId === userId
                ? this.signaling.endCall(ctx.call.roomId, ctx.call.id, { reason: "cancelled" })
                : this.signaling.leaveCall(ctx.call.roomId, ctx.call.id);
            void end.catch(() => {
                // ignore — destroy must be sync-safe for Angular teardown
            });
        }
        void this.teardownMedia();
        this.context = null;
        this.pendingInvite = null;
        this.transition("idle");
        this.removeAllListeners();
    }
    /** Replay an invite that arrived before this client was constructed. */
    ingestInvite(payload) {
        this.handleInvite(payload);
    }
    log(...args) {
        if (this.debug) {
            console.info("[sendsar-call]", ...args);
        }
    }
    isEpochCurrent(epoch) {
        return !this.destroyed && epoch === this.callEpoch;
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
            if (this.pendingInvite && this.pendingInvite.callId === callId) {
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
        // Already in a call — ignore secondary invites (Telegram-style busy).
        if (isInCallState(this.state)) {
            this.log("busy: ignoring invite while in call", {
                pending: payload.callId,
                active: this.context?.call.id,
                state: this.state,
            });
            return;
        }
        this.pendingInvite = payload;
        if (this.state === "idle") {
            this.transition("incoming");
        }
        this.emit("incoming", payload);
    }
    async joinMediaAfterAccept() {
        const ctx = this.context;
        if (!ctx || this.callState !== "outgoing") {
            return;
        }
        const epoch = ++this.callEpoch;
        this.transition("connecting");
        const callId = ctx.call.id;
        try {
            // Fresh token at accept time — start-time credentials can be stale, and a
            // fresh join helps LiveKit Cloud pin both peers to the same room instance.
            const refreshed = await this.signaling.refreshCallToken(ctx.call.roomId, callId);
            if (!this.isEpochCurrent(epoch))
                return;
            const current = this.context;
            if (!current || current.call.id !== callId) {
                return;
            }
            this.context = { ...current, livekit: refreshed.livekit };
            await this.connectMedia(refreshed.livekit, current.call.type, epoch);
        }
        catch (cause) {
            if (!this.isEpochCurrent(epoch))
                return;
            const current = this.context;
            if (current && current.call.id === callId) {
                this.emit("error", { message: "Failed to connect call media after accept", cause });
                await this.finalizeCall("media_error");
            }
        }
    }
    async connectMedia(livekit, type, epoch) {
        try {
            await this.media.connect(livekit, mediaFlagsForCallType(type));
            if (!this.isEpochCurrent(epoch)) {
                await this.media.disconnect();
                return;
            }
            // LiveKit refreshes JWTs for connected participants automatically — no client timer needed.
            if (this.state === "outgoing" || this.state === "connecting") {
                this.transition("active");
            }
            if (this.context) {
                this.emit("mediaConnected", { call: this.context.call });
            }
        }
        catch (cause) {
            if (!this.isEpochCurrent(epoch))
                return;
            this.emit("error", { message: "Failed to connect call media", cause });
            await this.finalizeCall("media_error");
            throw cause;
        }
    }
    async handleMediaDisconnected(reason) {
        if (this.tearingDown || !this.context)
            return;
        if (this.state === "idle" || this.state === "ended")
            return;
        // Unexpected drop (server deleted room, network failure after retries, etc.).
        await this.finalizeCall(reason ?? "media_disconnected");
    }
    async teardownMedia() {
        this.tearingDown = true;
        try {
            await this.media.disconnect();
        }
        finally {
            this.tearingDown = false;
        }
    }
    async finalizeCall(reason) {
        this.callEpoch += 1;
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