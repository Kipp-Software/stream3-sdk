// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import { encodeJson } from "./contracts/developer-json.js";
import { parseResponse } from "./response.js";
import { createWebSocketTransport } from "./websocket.js";
import { eventSubscription } from "./events.js";
export { EventReplayGapError, EventStreamError } from "./events.js";
export type { EventSubscription, EventDelivery } from "./events.js";
import type {
  JsonValue,
  OperationSubmission,
  VariableMutation,
  ActionSubmission,
  DeveloperMethod,
  DeveloperMethods,
  DeveloperResponse,
  DeveloperEventType,
  DeveloperErrorCode,
} from "./contracts/developer-types.js";
export type {
  DeveloperErrorCode,
  DeveloperError,
  DeveloperEventPayloads,
  DeveloperAutomationEventData,
  OperationSubmission,
  VariableMutation,
  ActionSubmission,
  JsonValue,
  DeveloperEvent,
  DeveloperEventType,
  DeveloperMethods,
} from "./contracts/developer-types.js";
export {
  developerOperationIds,
  developerAutomationEventCatalog,
  developerAutomationEventIds,
  developerOperationUsesConnection,
} from "./contracts/developer-types.js";
export type {
  DeveloperAutomationEventGrant,
  DeveloperAutomationEventId,
  DeveloperEventResource,
  DeveloperOperationId,
} from "./contracts/developer-types.js";
import type { DeveloperOperationId } from "./contracts/developer-operation-ids.js";
import type {
  DeveloperOperationInput,
  DeveloperConnectionOperationId,
  DeveloperOperationOutput,
} from "./contracts/developer-operation-types.js";
export type {
  DeveloperOperationInputs,
  DeveloperConnectionOperationId,
  DeveloperOperationOutputs,
  DeveloperOperationInput,
  DeveloperOperationOutput,
  DeveloperOperationDescriptor,
} from "./contracts/developer-operation-types.js";
export type TypedOperationSubmission<
  K extends DeveloperOperationId = DeveloperOperationId,
> = {
  [P in K]: Omit<
    OperationSubmission,
    "operation" | "input" | "connectionId"
  > & {
    operation: P;
    input: DeveloperOperationInput<P>;
  } & (P extends DeveloperConnectionOperationId
      ? { connectionId: string }
      : { connectionId?: never });
}[K];
export type OperationReceipt<K extends DeveloperOperationId> =
  DeveloperMethods["operations.invoke"]["output"] & { operation: K };
export type OperationRun<K extends DeveloperOperationId> =
  | (Omit<DeveloperMethods["runs.get"]["output"], "status" | "result"> & {
      status: "completed";
      result: DeveloperOperationOutput<K>;
    })
  | (Omit<DeveloperMethods["runs.get"]["output"], "status"> & {
      status: Exclude<
        DeveloperMethods["runs.get"]["output"]["status"],
        "completed"
      >;
    });
/** API error with a stable code, status, and ID for the failed request. */
export class DeveloperApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: DeveloperErrorCode,
    readonly requestId: string,
  ) {
    super(message);
    this.name = "DeveloperApiError";
  }
}
export type RequestOptions = {
  /** Stop the request or wait. A run already accepted by the app continues. */
  signal?: AbortSignal;
};
export type WaitOptions = RequestOptions & {
  /** Overall wait deadline (1–2,147,483,647 ms). Defaults to 60,000. Use null for no overall deadline. */
  timeoutMs?: number | null;
};
/**
 * Create an action request that expires in 60 seconds.
 * To recover after a restart, save the submission before sending it.
 */
export function actionSubmission(
  actionId: string,
  arguments_: ActionSubmission["arguments"] = {},
): ActionSubmission {
  return {
    actionId,
    arguments: arguments_,
    requestId: crypto.randomUUID(),
    expiresAt: Date.now() + 60000,
  };
}
/** Create an operation request. Pass a connection ID for connection-specific operations. */
export function operationSubmission<const K extends DeveloperOperationId>(
  operation: K,
  ...args: K extends DeveloperConnectionOperationId
    ? [input: DeveloperOperationInput<NoInfer<K>>, connectionId: string]
    : {} extends DeveloperOperationInput<K>
      ? [input?: DeveloperOperationInput<NoInfer<K>>]
      : [input: DeveloperOperationInput<NoInfer<K>>]
): TypedOperationSubmission<K>;
export function operationSubmission(
  operation: DeveloperOperationId,
  input: Record<string, JsonValue> = {},
  connectionId?: string,
): OperationSubmission {
  return {
    operation,
    input,
    connectionId,
    requestId: crypto.randomUUID(),
    expiresAt: Date.now() + 60000,
  };
}
/** Create a cancellation request for a run. Completed effects remain in place. */
export function cancellationSubmission(
  runId: string,
): DeveloperMethods["runs.cancel"]["input"] {
  return {
    runId,
    requestId: crypto.randomUUID(),
    expiresAt: Date.now() + 60000,
  };
}
/** Create a variable update. Pass `expected` to require a matching value or a missing key. */
export function variableMutation(
  scope: string,
  key: string,
  change: VariableMutation["change"],
  expected?: VariableMutation["expected"],
): VariableMutation {
  return {
    scope,
    key,
    change,
    expected,
    requestId: crypto.randomUUID(),
    expiresAt: Date.now() + 60000,
  };
}
export type ClientOptions = {
  /** Local HTTP URL from Developer API settings. */
  url: string;
  /** Token shown once when you create the grant. */
  token: string;
  /** Transport for commands. Defaults to HTTP. */
  transport?: "http" | "websocket";
  /** Timeout for each request (1–2,147,483,647 ms). Defaults to 10,000. */
  timeoutMs?: number;
};
function validateTimeout(timeoutMs: number): number {
  // Node schedules overflowing timer delays after 1 ms.
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647)
    throw new RangeError("timeoutMs must be an integer between 1 and 2147483647 milliseconds");
  return timeoutMs;
}

/**
 * Connect to the local Developer API. Call `close()` when finished.
 * Mutations are never retried automatically.
 * If a mutation times out, check its receipt before retrying it yourself.
 */
export function createClient({ url, token, transport = "http", timeoutMs = 10000 }: ClientOptions) {
  validateTimeout(timeoutMs);
  const base = new URL(url);
  if (
    base.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error(
      "Use the local HTTP URL from Developer API settings",
    );
  const lifetime = new AbortController();
  const subscriptions = new Map<string, ReturnType<typeof eventSubscription>>();
  const websocket = createWebSocketTransport(
    base,
    token,
    timeoutMs,
    (frame) => subscriptions.get(frame.subscriptionId)?.receive(frame),
    (error) => {
      for (const subscription of subscriptions.values()) subscription.fail(error);
    },
  );
  function request<K extends DeveloperMethod>(
    method: K,
    input: DeveloperMethods[K]["input"],
    requestOptions: RequestOptions = {},
  ): Promise<DeveloperMethods[K]["output"]> {
    return sendRequest(method, input, requestOptions);
  }
  async function sendRequest<K extends DeveloperMethod>(
    method: K,
    input: DeveloperMethods[K]["input"],
    requestOptions: RequestOptions,
    onSent?: (peer: WebSocket) => void,
  ): Promise<DeveloperMethods[K]["output"]> {
    const signal = AbortSignal.any([
      lifetime.signal,
      ...(requestOptions.signal ? [requestOptions.signal] : []),
      AbortSignal.timeout(timeoutMs),
    ]);
    signal.throwIfAborted();
    const id = crypto.randomUUID();
    const body = encodeJson({ version: 1, id, method, input });
    let reply: DeveloperResponse;
    if (transport === "websocket" || method.startsWith("events.")) {
      reply = await websocket.send(id, body, signal, onSent);
    } else {
      const response = await fetch(new URL("/developer/v1/rpc", base), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
        signal,
        redirect: "error",
      });
      reply = parseResponse(await response.json());
    }
    // Live can reject an HTTP request before reading its ID.
    if (reply.id !== id && !(reply.id === "" && "error" in reply))
      throw new Error("Invalid public API response");
    if ("error" in reply)
      throw new DeveloperApiError(
        reply.error.message,
        reply.error.status,
        reply.error.code,
        id,
      );
    return reply.result as DeveloperMethods[K]["output"];
  }
  async function waitForRun(runId: string, options: WaitOptions = {}) {
    const { signal: callerSignal, timeoutMs = 60000 } = options;
    const signals = [lifetime.signal];
    if (callerSignal) signals.push(callerSignal);
    if (timeoutMs !== null) signals.push(AbortSignal.timeout(validateTimeout(timeoutMs)));
    const signal = AbortSignal.any(signals);
    for (;;) {
      const run = await request("runs.get", { runId }, { signal });
      switch (run.status) {
        case "completed":
        case "cancelled":
        case "failed":
        case "interrupted":
          return run;
        case "queued":
        case "running":
        case "waiting":
          break;
        default:
          throw new Error(
            "Unsupported run status: " + String(run.status satisfies never),
          );
      }
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, 100);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
  return {
    events: {
      /** Subscribe to event types. Pass a confirmed cursor to resume delivery. */
      subscribe: async (
        input: { types: readonly DeveloperEventType[]; cursor?: string },
        subscribeOptions: RequestOptions = {},
      ) => {
        lifetime.signal.throwIfAborted();
        subscribeOptions.signal?.throwIfAborted();
        if (subscriptions.size >= 8)
          throw new Error("At most 8 subscriptions per client");
        const id = crypto.randomUUID();
        let origin: WebSocket | undefined;
        const subscriber = eventSubscription(
          id,
          request,
          () => (origin ? websocket.unsubscribe(origin, id) : Promise.resolve()),
          () => {
            subscriptions.delete(id);
            origin = undefined;
          },
          subscribeOptions.signal,
        );
        subscriptions.set(id, subscriber);
        try {
          subscriber.start(
            await sendRequest(
              "events.subscribe",
              { ...input, subscriptionId: id },
              subscribeOptions,
              (peer) => {
                origin = peer;
              },
            ),
          );
          return subscriber.subscription;
        } catch (error) {
          if (error instanceof DeveloperApiError) subscriber.fail(error);
          else void subscriber.subscription.close();
          throw error;
        }
      },
    },
    /** Call a Developer API method with its typed input. */
    request,
    system: {
      /** List supported methods and permissions for this grant. */
      capabilities: (options?: RequestOptions) =>
        request("system.capabilities", {}, options),
    },
    variables: {
      /** List variables in a scope that match the granted key prefix. */
      list: (scope: string, options?: RequestOptions) =>
        request("variables.list", { scope }, options),
      /** Read a variable. Check `exists` to distinguish a missing key from a null value. */
      get: (scope: string, key: string, options?: RequestOptions) =>
        request("variables.get", { scope, key }, options),
      /** Apply a variable change and return its receipt. */
      mutate: (submission: VariableMutation, options?: RequestOptions) =>
        request("variables.mutate", submission, options),
    },
    operations: {
      /** List operations allowed by this grant. */
      list: (options?: RequestOptions) =>
        request("operations.list", {}, options),
      /** Get the operation schema and execution policy. */
      describe: (operation: DeveloperOperationId, options?: RequestOptions) =>
        request("operations.describe", { operation }, options),
      /** Submit an operation and return its receipt. */
      invoke: async <K extends DeveloperOperationId>(
        submission: TypedOperationSubmission<K>,
        options?: RequestOptions,
      ): Promise<OperationReceipt<K>> => {
        const operation = submission.operation;
        const receipt = await request(
          "operations.invoke",
          {
            ...submission,
            operation,
            input: submission.input as OperationSubmission["input"],
          },
          options,
        );
        return { ...receipt, operation };
      },
      /** Wait for the run in the receipt. Check for `completed` to read the typed result. */
      wait: async <K extends DeveloperOperationId>(
        receipt: OperationReceipt<K>,
        options?: WaitOptions,
      ): Promise<OperationRun<K>> => {
        const { runId, operation } = receipt;
        if (!runId) throw new Error("Operation receipt has no run ID");
        const run = await waitForRun(runId, options);
        if (run.operation !== operation)
          throw new Error("Operation in the receipt does not match the run");
        // The operation ID determines the result type.
        return run as OperationRun<K>;
      },
    },
    actions: {
      /** List deployed manual actions allowed by this grant. */
      list: (options?: RequestOptions) => request("actions.list", {}, options),
      /** Submit a deployed action and return its receipt. */
      run: (submission: ActionSubmission, options?: RequestOptions) =>
        request("actions.run", submission, options),
    },
    requests: {
      /** Look up a receipt by the original submission request ID. */
      get: (requestId: string, options?: RequestOptions) =>
        request("requests.get", { requestId }, options),
    },
    runs: {
      /** Get the status and result of a run created by this grant. */
      get: (runId: string, options?: RequestOptions) =>
        request("runs.get", { runId }, options),
      /** Wait for a run to finish. The default wait timeout is 60 seconds. */
      wait: waitForRun,
      /** Request cancellation of a run created by this grant. */
      cancel: (
        submission: DeveloperMethods["runs.cancel"]["input"],
        options?: RequestOptions,
      ) => request("runs.cancel", submission, options),
    },
    /** Close the client and reject pending requests. */
    close: () => {
      lifetime.abort(new Error("Client closed"));
      websocket.close(lifetime.signal.reason);
    },
  };
}

/** Client returned by `createClient()`. */
export type Stream3Client = ReturnType<typeof createClient>;
