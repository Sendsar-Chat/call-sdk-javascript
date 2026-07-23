export function bindCallSignaling(signaling, handlers) {
    return {
        invite: signaling.callInvite(handlers.onInvite),
        accepted: signaling.callAccepted(handlers.onAccepted),
        declined: signaling.callDeclined(handlers.onDeclined),
        ended: signaling.callEnded(handlers.onEnded),
    };
}
export function unbindCallSignaling(unsubs) {
    if (!unsubs)
        return;
    unsubs.invite();
    unsubs.accepted();
    unsubs.declined();
    unsubs.ended();
}
//# sourceMappingURL=signaling.js.map