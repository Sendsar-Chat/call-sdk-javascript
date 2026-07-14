export class EventEmitter {
    listeners = new Map();
    on(event, handler) {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(handler);
        return () => this.off(event, handler);
    }
    off(event, handler) {
        this.listeners.get(event)?.delete(handler);
    }
    emit(event, payload) {
        const set = this.listeners.get(event);
        if (!set)
            return;
        for (const handler of set) {
            handler(payload);
        }
    }
    removeAllListeners() {
        this.listeners.clear();
    }
}
//# sourceMappingURL=events.js.map