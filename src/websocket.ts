// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import type {
  DeveloperEventFrame,
  DeveloperEventType,
  DeveloperResponse,
} from "./contracts/developer-types.js";
import { parseResponse } from "./response.js";

const maxPendingRequests = 16;
const supportedEventTypes = {
  "action.lifecycle": true,
  "variable.changed": true,
  "automation.event": true,
} satisfies Record<DeveloperEventType, true>;

export function createWebSocketTransport(
  base: URL,
  token: string,
  timeoutMs: number,
  onEvent: (frame: DeveloperEventFrame) => void,
  onDisconnect: (error: Error) => void,
) {
  let socket: WebSocket | undefined;
  let connecting: Promise<WebSocket> | undefined;
  let disconnect: ((error: Error) => void) | undefined;
  // Each ID holds one host slot. A null entry has no caller waiting for its reply.
  const pending = new Map<
    string,
    {
      resolve: (value: DeveloperResponse) => void;
      reject: (error: unknown) => void;
    } | null
  >();
  // Only subscription teardown waits for capacity. Ordinary calls still fail fast.
  const queuedCleanups: Array<() => void> = [];
  function drainCleanups() {
    while (queuedCleanups.length && pending.size < maxPendingRequests) queuedCleanups.shift()!();
  }

  function connect(): Promise<WebSocket> {
    if (connecting) return connecting;
    const url = new URL("/developer/v1/ws", base);
    url.protocol = "ws:";
    const peer = new WebSocket(url);
    socket = peer;
    let authenticated = false;
    connecting = new Promise<WebSocket>((resolve, reject) => {
      const timeout = setTimeout(
        () => end(new Error("WebSocket authentication timed out")),
        timeoutMs,
      );

      function end(error: Error) {
        if (socket !== peer) return;
        clearTimeout(timeout);
        socket = undefined;
        connecting = undefined;
        disconnect = undefined;
        reject(error);
        for (const entry of pending.values()) entry?.reject(error);
        pending.clear();
        drainCleanups();
        onDisconnect(error);
        peer.close();
      }
      disconnect = end;
      peer.addEventListener("open", () => {
        if (socket === peer) peer.send(JSON.stringify({ version: 1, type: "authenticate", token }));
      });
      peer.addEventListener("message", (event) => {
        if (socket !== peer) return;
        try {
          const frame = JSON.parse(String(event.data));
          if (authenticated && typeof frame?.id === "string" && frame.id.length > 0) {
            const entry = pending.get(frame.id);
            pending.delete(frame.id);
            // The caller may already have cancelled or timed out.
            if (entry) {
              try {
                entry.resolve(parseResponse(frame));
              } catch (error) {
                entry.reject(error);
              }
            }
            drainCleanups();
            return;
          }
          if (frame?.version !== 1) throw new Error("Unsupported public API version");
          if (!authenticated) {
            if (frame.type !== "authenticated")
              throw new Error("Expected WebSocket authentication");
            authenticated = true;
            clearTimeout(timeout);
            resolve(peer);
            return;
          }
          if (
            typeof frame.subscriptionId !== "string" ||
            typeof frame.cursor !== "string" ||
            !(
              (frame.type === "gap" && (frame.reason === "expired" || frame.reason === "epoch")) ||
              (frame.type === "event" &&
                frame.event?.version === 1 &&
                Object.hasOwn(supportedEventTypes, frame.event.type))
            )
          )
            throw new Error("Invalid WebSocket frame");
          onEvent(frame as DeveloperEventFrame);
        } catch (error) {
          end(error instanceof Error ? error : new Error("Invalid WebSocket frame"));
        }
      });
      peer.addEventListener("error", () => end(new Error("WebSocket connection failed")));
      peer.addEventListener("close", (event) => {
        end(
          new Error(
            `WebSocket disconnected${event.reason ? `: ${event.reason}` : ""}. Resume events from the confirmed cursor or check the submission receipt before retrying.`,
          ),
        );
      });
    });
    return connecting;
  }
  async function send(
    id: string,
    body: string,
    signal: AbortSignal,
    onSent?: (peer: WebSocket) => void,
  ) {
    const connection = connect();
    const peer = await new Promise<WebSocket>((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener("abort", abort);
        reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      void connection.then(
        (peer) => {
          signal.removeEventListener("abort", abort);
          resolve(peer);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    if (socket !== peer) throw new Error("WebSocket disconnected before sending request");
    if (pending.size >= maxPendingRequests)
      throw new Error("A client supports up to 16 concurrent WebSocket requests");
    return sendOnPeer(peer, id, body, signal, onSent);
  }

  function sendOnPeer(
    peer: WebSocket,
    id: string,
    body: string,
    signal: AbortSignal,
    onSent?: (peer: WebSocket) => void,
  ) {
    return new Promise<DeveloperResponse>((resolve, reject) => {
      const abort = () => {
        pending.set(id, null);
        reject(signal.reason);
      };
      pending.set(id, {
        resolve(value) {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        reject(error) {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      });
      signal.addEventListener("abort", abort, { once: true });
      try {
        peer.send(body);
        onSent?.(peer);
      } catch (error) {
        pending.delete(id);
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    });
  }

  async function unsubscribeOnPeer(peer: WebSocket, subscriptionId: string) {
    if (socket === peer) {
      const id = crypto.randomUUID();
      const body = JSON.stringify({
        version: 1,
        id,
        method: "events.unsubscribe",
        input: { subscriptionId },
      });
      // Start the request timeout once the cleanup has a slot on the wire.
      try {
        const reply = await sendOnPeer(peer, id, body, AbortSignal.timeout(timeoutMs));
        if ("result" in reply && "ok" in reply.result && reply.result.ok === true) return;
        throw new Error("Live did not confirm the unsubscribe");
      } catch (error) {
        // A session close also releases every subscription it owns.
        if (socket === peer)
          disconnect?.(error instanceof Error ? error : new Error("Unsubscribe failed"));
      }
    }
    if (peer.readyState !== WebSocket.CLOSED)
      await new Promise<void>((resolve) =>
        peer.addEventListener("close", () => resolve(), { once: true }),
      );
  }

  return {
    send,
    unsubscribe(peer: WebSocket, subscriptionId: string): Promise<void> {
      if (socket !== peer) return unsubscribeOnPeer(peer, subscriptionId);
      return new Promise<void>((resolve) => {
        queuedCleanups.push(() => resolve(unsubscribeOnPeer(peer, subscriptionId)));
        drainCleanups();
      });
    },
    close(error: Error) {
      disconnect?.(error);
    },
  };
}
