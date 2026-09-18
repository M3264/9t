#!/usr/bin/env node
import { createServer } from "node:http";
import { resolve } from "node:path";
import next from "next";
import { attachMobileSocket } from "./mobile-socket.mjs";

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT || 3265);
const hostname = process.env.NINE_T_HOST || "0.0.0.0";
const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const handleUpgrade = app.getUpgradeHandler();
const server = createServer((req, res) => {
  if (req.url === "/api/mobile/socket") {
    res.writeHead(426, { "Cache-Control": "no-store" });
    res.end("WebSocket required");
    return;
  }
  handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
});
const stopSockets = attachMobileSocket(server, resolve(process.env.NINE_T_DATA_DIR || "data", "9t.json"));
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/api/mobile/socket") {
    if (dev) handleUpgrade(req, socket, head);
    else socket.destroy();
  }
});
server.listen(port, hostname, () => console.log(`9t listening on ${hostname}:${port} · live device connections enabled`));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  await stopSockets();
  await new Promise(resolve => server.close(resolve));
  await app.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
