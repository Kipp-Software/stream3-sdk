// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import type { DeveloperAutomationEventData } from "./developer-event-types.js";
export type {
  DeveloperEventPayloads,
  DeveloperAutomationEventData,
} from "./developer-event-types.js";
import type { DeveloperAutomationEventGrant } from "./developer-event-catalog.js";
export {
  developerAutomationEventCatalog,
  developerAutomationEventIds,
  type DeveloperAutomationEventGrant,
  type DeveloperAutomationEventId,
  type DeveloperEventResource,
} from "./developer-event-catalog.js";
import type { DeveloperOperationDescriptor } from "./developer-operation-types.js";
/** Portable public v1 wire types. No internal protocol or runtime dependency. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type ActionSubmission = {
  actionId: string;
  arguments: Record<string, JsonValue>;
  requestId: string;
  expiresAt: number;
};
import type { DeveloperOperationId } from "./developer-operation-ids.js";
export {
  developerOperationIds,
  type DeveloperOperationId,
} from "./developer-operation-ids.js";
/** Connection-bound permissions never authorize an implicit primary or every connection. */
export const developerOperationUsesConnection = (id: DeveloperOperationId) =>
  id.startsWith("obs.") || id.startsWith("obs-read.") || id === "discord.send";
export type DeveloperAccess = {
  events?: readonly DeveloperAutomationEventGrant[];
  variables: readonly {
    scope: string;
    keyPrefix: string;
    read: boolean;
    write: boolean;
  }[];
  operations: readonly {
    id: DeveloperOperationId;
    connectionId?: string;
    /** Optional exact input matches. Omitting this field authorizes all inputs for this operation. */
    inputs?: Readonly<Record<string, JsonValue>>;
  }[];
};
export type OperationSubmission = {
  operation: DeveloperOperationId;
  input: Record<string, JsonValue>;
  connectionId?: string;
  requestId: string;
  expiresAt: number;
};
export type VariableMutation = {
  scope: string;
  key: string;
  change:
    | { type: "set"; value: JsonValue }
    | { type: "delete" }
    | { type: "increment"; value: number };
  expected?: { exists: false } | { exists: true; value: JsonValue };
  requestId: string;
  expiresAt: number;
};
export type DeveloperMethods = {
  "variables.list": {
    input: { scope: string };
    output: { values: Record<string, JsonValue> };
  };
  "variables.get": {
    input: { scope: string; key: string };
    output: { exists: boolean; value: JsonValue };
  };
  "variables.mutate": {
    input: VariableMutation;
    output: DeveloperMethods["actions.run"]["output"];
  };
  "operations.describe": {
    input: { operation: DeveloperOperationId };
    output: DeveloperOperationDescriptor;
  };
  "operations.list": {
    input: Record<string, never>;
    output: { operations: DeveloperAccess["operations"] };
  };
  "operations.invoke": {
    input: OperationSubmission;
    output: DeveloperMethods["actions.run"]["output"];
  };

  "events.subscribe": {
    input: {
      subscriptionId: string;
      types: readonly DeveloperEventType[];
      cursor?: string;
    };
    output: {
      subscriptionId: string;
      cursor: string;
      gap: "expired" | "epoch" | null;
    };
  };
  "events.ack": {
    input: { subscriptionId: string; cursor: string };
    output: { ok: true };
  };
  "events.unsubscribe": {
    input: { subscriptionId: string };
    output: { ok: true };
  };
  "system.capabilities": {
    input: Record<string, never>;
    output: {
      version: 1;
      methods: string[];
      actionIds: string[];
      events: DeveloperEventGrants;
      access: DeveloperAccess;
      transport: "http" | "websocket" | "udp";
    };
  };
  "actions.list": {
    input: Record<string, never>;
    output: { actions: { id: string; name: string; enabled: boolean }[] };
  };
  "actions.run": {
    input: ActionSubmission;
    output: { requestId: string; runId: string | null; acceptedAt: number };
  };
  "requests.get": {
    input: { requestId: string };
    output: DeveloperMethods["actions.run"]["output"];
  };
  "runs.cancel": {
    input: { runId: string; requestId: string; expiresAt: number };
    output: DeveloperMethods["actions.run"]["output"];
  };
  "runs.get": {
    input: { runId: string };
    output: {
      runId: string;
      operation: DeveloperOperationId | null;
      status:
        | "queued"
        | "running"
        | "waiting"
        | "completed"
        | "cancelled"
        | "failed"
        | "interrupted";
      error: string | null;
      result: Record<string, JsonValue> | null;
    };
  };
};
export type DeveloperMethod = keyof DeveloperMethods;
export type DeveloperRequest = {
  [K in DeveloperMethod]: {
    version: 1;
    id: string;
    method: K;
    input: DeveloperMethods[K]["input"];
  };
}[DeveloperMethod];
/** Stable failure categories for recovery without parsing messages */
export type DeveloperErrorCode =
  | "invalid_request"
  | "unauthenticated"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "request_conflict"
  | "variable_conflict"
  | "submission_expired"
  | "capacity_exceeded"
  | "payload_too_large"
  | "unavailable"
  | "internal_error";
export type DeveloperError = {
  code: DeveloperErrorCode;
  status: number;
  message: string;
};
export type DeveloperResponse =
  | {
      version: 1;
      id: string;
      result: DeveloperMethods[DeveloperMethod]["output"];
    }
  | { version: 1; id: string; error: DeveloperError };

export type DeveloperEventType =
  | "action.lifecycle"
  | "variable.changed"
  | "automation.event";
export type DeveloperEventGrants = {
  actionIds: readonly string[];
  variables: readonly { scope: string; keyPrefix: string }[];
  automation?: readonly DeveloperAutomationEventGrant[];
};
export type DeveloperEvent = {
  id: string;
  version: 1;
  occurredAt: number;
} & (
  | {
      type: "automation.event";
      data: DeveloperAutomationEventData;
    }
  | {
      type: "action.lifecycle";
      data: {
        actionId: string;
        runId: string;
        revision: number;
        status: DeveloperMethods["runs.get"]["output"]["status"];
        previousStatus: DeveloperMethods["runs.get"]["output"]["status"] | null;
      };
    }
  | {
      type: "variable.changed";
      data: {
        scope: string;
        key: string;
        previousExists: boolean;
        currentExists: boolean;
        values: { previous: JsonValue; current: JsonValue } | null;
      };
    }
);
export type DeveloperEventFrame =
  | {
      version: 1;
      type: "event";
      subscriptionId: string;
      cursor: string;
      event: DeveloperEvent;
    }
  | {
      version: 1;
      type: "gap";
      subscriptionId: string;
      cursor: string;
      reason: "expired" | "epoch";
    };

export type DeveloperEventPage = {
  cursor: string;
  gap: "expired" | "epoch" | null;
  events: { cursor: string; event: DeveloperEvent }[];
};
