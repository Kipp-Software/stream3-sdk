// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import type { JsonValue } from "./developer-types.js";

/** Snapshot plain JSON without invoking accessors or custom conversion
 * Omit optional undefined object properties */
export function encodeJson(value: unknown): string {
  const ancestors = new Set<object>();
  const encoder = {
    copy(value: unknown, optional: boolean): JsonValue | undefined {
      switch (typeof value) {
        case "string":
        case "boolean":
          return value;
        case "number":
          if (!Number.isFinite(value))
            throw new TypeError("JSON requires finite numbers");
          return value;
        case "undefined":
          if (optional) return undefined;
          throw new TypeError(
            "JSON array elements and roots cannot be undefined",
          );
        case "object": {
          if (value === null) return null;
          if (ancestors.has(value))
            throw new TypeError("JSON cannot contain cycles");
          const array = Array.isArray(value);
          if (
            !array &&
            Object.getPrototypeOf(value) !== Object.prototype &&
            Object.getPrototypeOf(value) !== null
          )
            throw new TypeError(
              "JSON requires plain objects. Convert dates and other objects explicitly",
            );
          for (
            let prototype: object | null = value;
            prototype;
            prototype = Object.getPrototypeOf(prototype)
          ) {
            const conversion = Object.getOwnPropertyDescriptor(
              prototype,
              "toJSON",
            );
            if (
              conversion &&
              (!("value" in conversion) ||
                typeof conversion.value === "function")
            )
              throw new TypeError(
                "JSON cannot invoke custom toJSON conversion",
              );
          }
          if (
            Object.getOwnPropertySymbols(value).some(
              (key) => Object.getOwnPropertyDescriptor(value, key)?.enumerable,
            )
          )
            throw new TypeError("JSON cannot contain symbol properties");
          ancestors.add(value);
          try {
            const entries: [string, JsonValue][] = [];
            for (const key of Object.keys(value)) {
              const property = Object.getOwnPropertyDescriptor(value, key)!;
              if (!("value" in property))
                throw new TypeError("JSON cannot contain accessor properties");
              const item = this.copy(property.value, !array);
              if (item !== undefined) entries.push([key, item]);
            }
            if (!array) return Object.fromEntries(entries);
            if (
              entries.length !== value.length ||
              entries.some(([key], index) => key !== String(index))
            )
              throw new TypeError(
                "JSON arrays must be dense and contain only indexed elements",
              );
            return entries.map(([, item]) => item);
          } finally {
            ancestors.delete(value);
          }
        }
        case "bigint":
        case "symbol":
        case "function":
          throw new TypeError(
            "JSON cannot contain functions, symbols or bigint values",
          );
      }
    },
  };
  return JSON.stringify(encoder.copy(value, false));
}
