// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kipp Software
import {
  createClient,
  developerAutomationEventCatalog,
  EventReplayGapError,
  EventStreamError,
} from "@stream3/sdk";
const { STREAM3_URL, STREAM3_TOKEN, STREAM3_CURSOR } = process.env;
if (!STREAM3_URL || !STREAM3_TOKEN)
  throw new Error(
    "Set STREAM3_URL and STREAM3_TOKEN. The grant must allow automation events for the resources you want to monitor.",
  );
const client = createClient({ url: STREAM3_URL, token: STREAM3_TOKEN });
const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
try {
  const subscription = await client.events.subscribe(
    { types: ["automation.event"], cursor: STREAM3_CURSOR },
    { signal: controller.signal },
  );
  for await (const delivery of subscription) {
    if (delivery.event.type !== "automation.event")
      throw new Error("Expected an automation.event delivery");
    const { event, resource, fields } = delivery.event.data;
    console.log(developerAutomationEventCatalog[event], resource, fields);
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
  } else if (!controller.signal.aborted) {
    if (!(error instanceof EventStreamError)) throw error;
    console.error("Stream stopped. Last confirmed cursor:", error.cursor);
    process.exitCode = 1;
  }
} finally {
  process.removeListener("SIGINT", stop);
  client.close();
}
