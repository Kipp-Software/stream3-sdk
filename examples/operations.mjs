// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import { createClient, operationSubmission } from "@stream3/sdk";

const { STREAM3_URL, STREAM3_TOKEN } = process.env;
if (!STREAM3_URL || !STREAM3_TOKEN)
  throw new Error(
    "Set STREAM3_URL and STREAM3_TOKEN. The grant must allow calculate.join.",
  );
const client = createClient({ url: STREAM3_URL, token: STREAM3_TOKEN });
try {
  console.log(await client.operations.describe("calculate.join"));
  const submission = operationSubmission("calculate.join", {
    value: ["hello", "world"],
    separator: " ",
  });
  // To recover after a restart, save this submission before sending it.
  const receipt = await client.operations.invoke(submission);
  const outcome = await client.operations.wait(receipt);
  if (outcome.status === "completed") {
    /** @type {string} */
    const text = outcome.result.value;
    console.log(text);
  } else console.error(outcome.status, outcome.error);
} finally {
  client.close();
}
