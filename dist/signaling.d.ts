import type { CallSignaling } from "@sendsar/chat-sdk-javascript/call-signaling";
export type SignalingUnsubscribers = {
    invite: () => void;
    accepted: () => void;
    declined: () => void;
    ended: () => void;
};
export declare function bindCallSignaling(signaling: CallSignaling, handlers: {
    onInvite: Parameters<CallSignaling["callInvite"]>[0];
    onAccepted: Parameters<CallSignaling["callAccepted"]>[0];
    onDeclined: Parameters<CallSignaling["callDeclined"]>[0];
    onEnded: Parameters<CallSignaling["callEnded"]>[0];
}): SignalingUnsubscribers;
export declare function unbindCallSignaling(unsubs: SignalingUnsubscribers | null): void;
//# sourceMappingURL=signaling.d.ts.map