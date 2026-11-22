#!/usr/bin/env node
import { PORT, OUTPUT_DIR, FINAL_DIR, ASSETS_ROOT } from "./config.js";
import { createStudioServer } from "./server.js";
import { loadCredentials } from "./security.js";
import { execFile } from "node:child_process";

// 0.0.0.0 keeps LAN access from phones and other PCs; behind a tunnel set HOST=127.0.0.1.
const HOST = process.env.HOST || "0.0.0.0";
const auth = loadCredentials({ host: HOST });
const server = createStudioServer({ auth });

server.listen(PORT, HOST, () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log("==============================================================");
  console.log(`MiniMax H3 Local Studio is running on ${HOST}:${PORT}`);
  console.log(`   - Local:   ${url}`);
  if (HOST !== "127.0.0.1") console.log(`   - Network: http://<this-computer's-LAN-IP>:${PORT}`);
  if (auth) {
    const where = auth.source === "env" ? "MINIMAX_STUDIO_PASSWORD" : auth.file;
    console.log(`   - Login:   user "${auth.user}", password in ${where}${auth.source === "generated" ? " (just generated)" : ""}`);
  } else {
    console.log("   - Login:   none (only reachable from this computer)");
  }
  console.log(`   - Shots:   ${OUTPUT_DIR}`);
  console.log(`   - Final:   ${FINAL_DIR}`);
  if (ASSETS_ROOT) console.log(`   - Assets:  ${ASSETS_ROOT}`);
  console.log("Press Ctrl+C to stop.");
  console.log("==============================================================");

  if (!process.env.MINIMAX_STUDIO_NO_OPEN) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    execFile(opener, [url], () => {});
  }
});
