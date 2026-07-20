# @sendsar/call-sdk-javascript

Voice and video for Sendsar web apps. **`CallClient`** wraps gateway signaling and LiveKit media on top of your connected **`@sendsar/chat-sdk-javascript`** client.

You never install or configure `livekit-client` — it is bundled here.

Chat-only tenants can skip this package.

## Prerequisites

- Node.js 18+
- `@sendsar/chat-sdk-javascript` connected with a session JWT
- Tenant with `settings.calls.enabled: true` ([server setup](https://docs.sendsar.com/setup/calls))

## Install

```bash
npm install @sendsar/chat-sdk-javascript @sendsar/call-sdk-javascript
```

## Quick start

```typescript
import Sendsar from "@sendsar/chat-sdk-javascript";
import { CallClient } from "@sendsar/call-sdk-javascript";

const chat = Sendsar.init({ apiUrl });
await chat.connect({ userId, token });

const calls = new CallClient({ chat });

calls.on("incoming", (invite) => showRingingUI(invite));
calls.on("localTrack", ({ track }) => attachLocalVideo(track));
calls.on("remoteTrack", ({ track, participant }) => attachRemoteVideo(track, participant));

await calls.start(roomId, { type: "video" });
await calls.accept(callId);
await calls.hangUp();

calls.destroy();
```

## API summary

| Method / property | Purpose |
| --- | --- |
| `start(roomId, { type })` | Outgoing call |
| `accept(callId)` / `decline(callId?)` | Incoming call |
| `hangUp()` | End (creator) or leave (group) |
| `rejoin(roomId)` | Reconnect after reload |
| `ringTimeoutSeconds` | 1:1 ring duration from tenant settings |
| `setMicrophoneEnabled` / `setCameraEnabled` | Device toggles |
| `on("incoming" \| "localTrack" \| …)` | Events — see docs |

LiveKit token refresh is automatic.

## Call history

Use **chat SDK** helpers for `data-call` timeline messages — no call SDK needed:

```typescript
import { formatCallLogPreview, parseCallLogPart } from "@sendsar/chat-sdk-javascript";
```

## Documentation

- [Voice & video calls](https://docs.sendsar.com/sdk/javascript/calls)
- [JavaScript SDK overview](https://docs.sendsar.com/sdk/javascript)
- [Server setup — Calls](https://docs.sendsar.com/setup/calls)

## Help

- [Documentation](https://docs.sendsar.com)
- [Issues](https://github.com/Sendsar-Chat/call-sdk-javascript/issues)

## License

MIT — see [LICENSE.md](./LICENSE.md).
