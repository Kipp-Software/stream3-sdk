// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import { createClient, EventReplayGapError, EventStreamError } from "@stream3/sdk";

const { STREAM3_URL, STREAM3_TOKEN, STREAM3_CURSOR } = process.env;
if (!STREAM3_URL || !STREAM3_TOKEN)
  throw new Error("Set STREAM3_URL and STREAM3_TOKEN. The grant must allow the requested events.");
const client = createClient({ url: STREAM3_URL, token: STREAM3_TOKEN });
const stop = new AbortController();
const interrupt = () => stop.abort();
process.once("SIGINT", interrupt);
try {
  const subscription = await client.events.subscribe(
    { types: ["action.lifecycle", "variable.changed"], cursor: STREAM3_CURSOR },
    { signal: stop.signal },
  );
  for await (const delivery of subscription) {
    console.log(delivery.event);
    // On replay, use the event ID to skip duplicates. Save your work before acknowledging.
    await delivery.ack();
    console.log("Confirmed cursor:", subscription.cursor);
  }
} catch (error) {
  if (error instanceof EventReplayGapError) {
    console.error(
      "Replay history unavailable. Review the gap before resuming:",
      error.reason,
      error.cursor,
    );
    process.exitCode = 1;
  } else if (!stop.signal.aborted) {
    if (!(error instanceof EventStreamError)) throw error;
    console.error("Stream stopped. Last confirmed cursor:", error.cursor);
    process.exitCode = 1;
  }
} finally {
  process.removeListener("SIGINT", interrupt);
  client.close();
}
