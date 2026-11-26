// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import { encodeJson } from "./contracts/developer-json.js";
import { createSocket } from "node:dgram";
import type { ActionSubmission } from "./contracts/developer-types.js";
/**
 * Send the action once to the local UDP port.
 * Look up the submission request ID over HTTP to confirm the app accepted it.
 */
export async function sendAction(options: {
  port: number;
  token: string;
  submission: ActionSubmission;
}): Promise<void> {
  if (
    !Number.isInteger(options.port) ||
    options.port < 1 ||
    options.port > 65535
  )
    throw new Error("Use the active UDP port (1–65535)");
  const packet = Buffer.from(
    encodeJson({
      token: options.token,
      request: {
        version: 1,
        id: options.submission.requestId,
        method: "actions.run",
        input: options.submission,
      },
    }),
  );
  if (packet.length > 1200)
    throw new Error(
      "UDP datagrams are limited to 1200 bytes. Use HTTP for larger requests.",
    );
  const socket = createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.send(packet, options.port, "127.0.0.1", (error) =>
        error ? reject(error) : resolve(),
      );
    });
  } finally {
    socket.close();
  }
}
