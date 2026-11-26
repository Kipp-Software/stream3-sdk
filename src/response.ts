// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import type { DeveloperErrorCode, DeveloperResponse } from "./contracts/developer-types.js";

const errorCodes = {
  invalid_request: true,
  unauthenticated: true,
  permission_denied: true,
  not_found: true,
  conflict: true,
  request_conflict: true,
  variable_conflict: true,
  submission_expired: true,
  capacity_exceeded: true,
  payload_too_large: true,
  unavailable: true,
  internal_error: true,
} satisfies Record<DeveloperErrorCode, true>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the v1 envelope. Each method defines its own result fields. */
export function parseResponse(value: unknown): DeveloperResponse {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    Object.hasOwn(value, "result") === Object.hasOwn(value, "error")
  )
    throw new Error("Invalid public API response");

  if ("error" in value) {
    const error = value.error;
    if (
      !isRecord(error) ||
      typeof error.message !== "string" ||
      typeof error.status !== "number" ||
      !Number.isInteger(error.status) ||
      typeof error.code !== "string" ||
      !Object.hasOwn(errorCodes, error.code)
    )
      throw new Error("Invalid public API response");
  } else if (!isRecord(value.result)) {
    throw new Error("Invalid public API response");
  }
  return value as DeveloperResponse;
}
