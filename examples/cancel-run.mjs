// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import { createClient, cancellationSubmission } from "@stream3/sdk";
const { STREAM3_URL, STREAM3_TOKEN, STREAM3_RUN_ID } = process.env;
if (!STREAM3_URL || !STREAM3_TOKEN || !STREAM3_RUN_ID)
  throw new Error(
    "Set STREAM3_URL, STREAM3_TOKEN and STREAM3_RUN_ID for a run owned by this grant",
  );
const client = createClient({ url: STREAM3_URL, token: STREAM3_TOKEN });
try {
  const submission = cancellationSubmission(STREAM3_RUN_ID);
  // Save the submission before sending so you can look up its receipt by request ID.
  console.log(await client.runs.cancel(submission));
  console.log(await client.runs.wait(STREAM3_RUN_ID));
  // Effects completed before cancellation remain in place.
} finally {
  client.close();
}
