const VALID_TRANSITIONS = {
    idle: new Set(["outgoing", "incoming", "connecting", "active"]),
    outgoing: new Set(["connecting", "active", "ended", "idle"]),
    incoming: new Set(["connecting", "ended", "idle"]),
    connecting: new Set(["active", "ended", "idle"]),
    active: new Set(["ended", "idle"]),
    ended: new Set(["idle"]),
};
export function canTransition(from, to) {
    if (from === to)
        return true;
    return VALID_TRANSITIONS[from].has(to);
}
export function assertTransition(from, to) {
    if (!canTransition(from, to)) {
        throw new Error(`Invalid call state transition: ${from} → ${to}`);
    }
}
export function isTerminalState(state) {
    return state === "ended" || state === "idle";
}
export function isInCallState(state) {
    return state === "outgoing" || state === "incoming" || state === "connecting" || state === "active";
}
//# sourceMappingURL=state-machine.js.map