// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import type {
  DeveloperEvent,
  DeveloperEventFrame,
  DeveloperMethods,
  DeveloperMethod,
} from "./contracts/developer-types.js";
/** The requested cursor is outside the available event history. */
export class EventReplayGapError extends Error {
  constructor(
    readonly cursor: string,
    readonly reason: "epoch" | "expired",
  ) {
    super(
      `Event replay gap (${reason}). To skip the missing events, resubscribe from cursor ${cursor}.`,
    );
    this.name = "EventReplayGapError";
  }
}
/** Delivery stopped. The cursor identifies the last position confirmed by the server, if available. */
export class EventStreamError extends Error {
  constructor(
    message: string,
    readonly cursor: string | undefined,
  ) {
    super(message);
    this.name = "EventStreamError";
  }
}
export type EventDelivery = {
  event: DeveloperEvent;
  cursor: string;
  /** Acknowledge each event in delivery order after processing it. */
  ack(): Promise<void>;
};
export type EventSubscription = AsyncIterableIterator<EventDelivery> & {
  /** Last cursor confirmed by the server. Save it to resume delivery. */
  readonly cursor: string | undefined;
  /** Stop delivery and wait until Live confirms removal or the owning connection closes. */
  close(): Promise<void>;
};
type Request = <K extends DeveloperMethod>(
  method: K,
  input: DeveloperMethods[K]["input"],
) => Promise<DeveloperMethods[K]["output"]>;
/** Buffer incoming events and advance the cursor when the server confirms an acknowledgement. */
export function eventSubscription(
  id: string,
  request: Request,
  unsubscribe: () => Promise<void>,
  remove: () => void,
  signal?: AbortSignal,
) {
  const queue: { delivery: EventDelivery; bytes: number }[] = [];
  const unacked: string[] = [];
  let bytes = 0,
    cursor: string | undefined,
    closed = false,
    failure: Error | undefined;
  let waiter:
    | {
        resolve: (value: IteratorResult<EventDelivery>) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  let cleanup = Promise.resolve();
  const finish = (error?: Error, releaseOnHost = false) => {
    if (closed) return cleanup;
    closed = true;
    failure = error;
    queue.length = 0;
    bytes = 0;
    unacked.length = 0;
    signal?.removeEventListener("abort", abort);
    if (error) waiter?.reject(error);
    else waiter?.resolve({ done: true, value: undefined });
    waiter = undefined;
    if (releaseOnHost) cleanup = unsubscribe().finally(remove);
    else remove();
    return cleanup;
  };
  const close = () => finish(undefined, true);
  const abort = () => {
    void close();
  };
  const subscription: EventSubscription = {
    get cursor() {
      return cursor;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
    next: async () => {
      if (failure) throw failure;
      const next = queue.shift();
      if (next) {
        bytes -= next.bytes;
        return { done: false, value: next.delivery };
      }
      if (closed) return { done: true, value: undefined };
      if (waiter) throw new Error("Use one iterator consumer per subscription");
      return new Promise((resolve, reject) => {
        waiter = { resolve, reject };
      });
    },
    return: async () => {
      await close();
      return { done: true, value: undefined };
    },
    close,
  };
  return {
    subscription,
    start: (value: DeveloperMethods["events.subscribe"]["output"]) => {
      if (failure) throw failure;
      if (value.gap) {
        const error = new EventReplayGapError(value.cursor, value.gap);
        finish(error);
        throw error;
      }
      cursor = value.cursor;
      signal?.throwIfAborted();
      signal?.addEventListener("abort", abort, { once: true });
    },
    fail: (error: Error) => finish(new EventStreamError(error.message, cursor)),
    receive: (frame: DeveloperEventFrame) => {
      if (closed) return;
      if (frame.type === "gap") {
        finish(new EventReplayGapError(frame.cursor, frame.reason));
        return;
      }
      const size = new TextEncoder().encode(JSON.stringify(frame)).byteLength;
      if (unacked.length >= 64 || bytes + size > 1048576) {
        void finish(new EventStreamError("SDK event buffer exceeded", cursor), true);
        return;
      }
      unacked.push(frame.cursor);
      let acknowledgement: Promise<void> | undefined;
      const delivery: EventDelivery = {
        event: frame.event,
        cursor: frame.cursor,
        ack: () =>
          (acknowledgement ??= (async () => {
            if (closed) throw failure ?? new Error("Subscription closed");
            if (unacked[0] !== frame.cursor)
              throw new Error("Acknowledge events in delivery order");
            await request("events.ack", {
              subscriptionId: id,
              cursor: frame.cursor,
            });
            if (closed) throw failure ?? new Error("Subscription closed");
            unacked.shift();
            cursor = frame.cursor;
          })().catch((error) => {
            acknowledgement = undefined;
            throw error;
          })),
      };
      if (waiter) {
        const current = waiter;
        waiter = undefined;
        current.resolve({ done: false, value: delivery });
      } else {
        queue.push({ delivery, bytes: size });
        bytes += size;
      }
    },
  };
}
