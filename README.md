# @stream3/sdk

Control the stream3 desktop app from a local Node.js script. Use the SDK to run deployed actions, call automation operations, read or update variables, and subscribe to events. The package uses ES modules and includes TypeScript declarations.

## Install

Use Node.js 26 or later. Run your script on the same machine as a stream3 build that includes the Developer API.

```sh
npm install @stream3/sdk
```

## Connect and list actions

1. In stream3, open **Automations → Data & sharing → Shortcuts & controls → Developer API**.
2. Enable the listener and save. Create an HTTP grant for a deployed manual action.
3. Copy the URL and token into a `.env` file in your script's project directory. Use the URL shown in the app.

```dotenv
STREAM3_URL=http://127.0.0.1:7475
STREAM3_TOKEN=your-grant-token
```

🔒 Add `.env` to your project's `.gitignore` to keep the grant token private.

Save the following as `list-actions.mjs`. It prints the ID, name, and enabled state of each action your grant can access.

```js
import { createClient } from "@stream3/sdk";

const client = createClient({
  url: process.env.STREAM3_URL,
  token: process.env.STREAM3_TOKEN,
});

try {
  const { actions } = await client.actions.list();
  console.table(actions);
} finally {
  client.close();
}
```

```sh
node --env-file=.env list-actions.mjs
```

To run an enabled action, add its ID to `.env` as `STREAM3_ACTION_ID`. Run the example from the directory where you installed the SDK.

```sh
node --env-file=.env node_modules/@stream3/sdk/examples/run-action.mjs
```

## Common tasks

| Task | How to use the client |
| --- | --- |
| Inspect permissions | Call `client.system.capabilities()` to see which methods and resources your grant allows. |
| Run an action | Pass an `actionSubmission()` to `client.actions.run()`. If the receipt includes a run ID, use `client.runs.wait(runId)` to get the outcome. [Run an action](examples/run-action.mjs) |
| Call an operation | List allowed operations with `client.operations.list()` and inspect inputs with `client.operations.describe(id)`. Pass an `operationSubmission()` to `client.operations.invoke()`, then call `client.operations.wait(receipt)`. [Call an operation](examples/operations.mjs) |
| Read or update variables | Use `client.variables.list(scope)` or `client.variables.get(scope, key)`. Pass a `variableMutation()` to `client.variables.mutate()` to set, delete, or increment a value. |
| Subscribe to events | Await `client.events.subscribe({ types })` and iterate over the deliveries. After handling each event, await `delivery.ack()` and save `subscription.cursor` to resume later. [Action and variable events](examples/events.mjs) and [Automation events](examples/automation-events.mjs) |
| Cancel a run | Pass `cancellationSubmission(runId)` to `client.runs.cancel()` for a run created by your grant. [Cancel a run](examples/cancel-run.mjs) |

⚠️ If a submission times out, look up its receipt with `client.requests.get(submission.requestId)` before retrying. Reuse the original submission. A new request ID can run the action twice.

Run and operation waits have a 60-second deadline, including when you pass an abort signal. Set `timeoutMs` in the wait options to change the deadline, or pass `{ timeoutMs: null, signal }` to wait until completion or cancellation. Client and wait timeouts accept whole milliseconds from 1 through 2,147,483,647. Each request still has its own timeout during an unlimited wait. Stopping a wait leaves the run active.

## Transports

Commands use HTTP by default. For a WebSocket grant, set `transport: "websocket"` in `createClient()`. Event subscriptions always use WebSocket and require a grant with event permissions.

For one-way action submission, import `sendAction` from `@stream3/sdk/udp` and pass the local UDP port, grant token, and action submission.

## SDK development

Run `npm ci` and `npm run build` from the repository root to compile the SDK and its TypeScript declarations.

- [Changelog](CHANGELOG.md)
- [MIT license](LICENSE)
