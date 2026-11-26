# Changelog

## 0.0.1-beta2

- `runs.wait()` and `operations.wait()` now keep their default 60-second deadline when you pass an `AbortSignal`. To wait until completion or cancellation, pass `{ timeoutMs: null, signal }`. Individual requests still use the client timeout.
- Cancelling or timing out a WebSocket request now keeps its slot reserved until Live replies or the socket closes. Late replies and malformed responses with a matching request ID are isolated from other calls.
- Closing an event subscription, leaving its iterator, or aborting setup now releases the subscription on its original connection, even when all 16 request slots are occupied. Repeated `close()` calls wait for the same cleanup.
- The client captures its connection settings at creation and validates response envelopes over both HTTP and WebSocket.
- The event examples exit successfully on Ctrl-C and report replay gaps and unexpected stream failures with a nonzero exit status.

## 0.0.1-beta1

First Node.js SDK for the stream3 Developer API v1. Requires Node.js 26 or later and a stream3 build with the Developer API and event subscriptions. This beta supports local Node.js scripts. LAN clients and hosted browsers are unsupported. Pin the exact SDK version if you depend on a beta API.

### Actions, operations, and variables

- List and run deployed manual actions over HTTP or WebSocket. Submit one-way action requests over loopback UDP.
- Look up a submission by request ID. Check status, wait for completion, or cancel a run created by your grant.
- Discover allowed automation operations and their JSON schemas. Call operations with typed inputs and read typed results. Grants can restrict the operation, resource, connection, and input values.
- Use portable catalog IDs, literal JSON calculation operands, persistent signal waits, and actions with embedded scripts. Author and deploy scripts in Studio before invoking them through the SDK.
- Read, set, delete, or increment saved and temporary variables in global and viewer scopes. Use compare-and-set for conditional updates and receipts to recover the result.

### Events

- Subscribe to action status changes, variable changes, and automation events with host, account, or connection grants. Account-scoped events include Twitch, Kick, and YouTube.
- Read typed event payloads generated from the event schemas. Acknowledge events in order and resume from a confirmed cursor. A replay gap signals that the requested history is unavailable.

### Package and tooling

- Dependency-free ES modules, TypeScript declarations, documented client options, generated operation and event references, and source maps with embedded source.
- Stable API error codes and transport request IDs. The SDK snapshots requests before sending and verifies the run's operation before returning a typed result. SDK transports and embedded scripts use the same JSON encoding.
- Runnable examples for actions, operations, cancellation, and events.
