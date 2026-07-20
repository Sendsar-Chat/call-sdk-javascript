import type { CallState } from "./types.js";
export declare function canTransition(from: CallState, to: CallState): boolean;
export declare function assertTransition(from: CallState, to: CallState): void;
export declare function isTerminalState(state: CallState): boolean;
export declare function isInCallState(state: CallState): boolean;
//# sourceMappingURL=state-machine.d.ts.map