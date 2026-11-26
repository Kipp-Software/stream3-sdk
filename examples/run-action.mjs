// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import { actionSubmission, createClient } from "@stream3/sdk";

const { STREAM3_URL, STREAM3_TOKEN, STREAM3_ACTION_ID } = process.env;
if (!STREAM3_URL || !STREAM3_TOKEN || !STREAM3_ACTION_ID)
  throw new Error("Set STREAM3_URL, STREAM3_TOKEN and STREAM3_ACTION_ID");
const client = createClient({ url: STREAM3_URL, token: STREAM3_TOKEN });
try {
  console.log(await client.system.capabilities());
  const submission = actionSubmission(STREAM3_ACTION_ID, {
    payload: { items: [1, 2] },
  });
  // To recover after a restart, save this submission before sending it.
  const receipt = await client.actions.run(submission);
  console.log(receipt);
  if (receipt.runId) console.log(await client.runs.wait(receipt.runId));
} finally {
  client.close();
}
