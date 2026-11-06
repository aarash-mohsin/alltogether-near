import { resolve } from "node:path";
import { createApplication } from "./http.ts";

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be 1–65535.");
const app = createApplication({
  dbPath: process.env.ALLTOGETHER_DB ?? resolve("data/alltogether.sqlite"),
});
app.server.listen(port, "127.0.0.1", () =>
  console.log(
    `AllTogether local ledger: http://127.0.0.1:${port} (local demo; no blockchain transactions)`,
  ),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
}
process.on("SIGINT", () => {
  void stop();
});
process.on("SIGTERM", () => {
  void stop();
});
