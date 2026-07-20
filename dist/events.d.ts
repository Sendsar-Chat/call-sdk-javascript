import type { CallClientEvent, CallClientEventMap } from "./types.js";
type Handler<E extends CallClientEvent> = (payload: CallClientEventMap[E]) => void;
export declare class EventEmitter {
    private readonly listeners;
    on<E extends CallClientEvent>(event: E, handler: Handler<E>): () => void;
    off<E extends CallClientEvent>(event: E, handler: Handler<E>): void;
    emit<E extends CallClientEvent>(event: E, payload: CallClientEventMap[E]): void;
    removeAllListeners(): void;
}
export {};
//# sourceMappingURL=events.d.ts.map