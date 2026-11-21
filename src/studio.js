#!/usr/bin/env node
import { PORT } from "./config.js";
import { createStudioServer } from "./server.js";
import { execFile } from "node:child_process";

const server = createStudioServer();

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log("==============================================================");
  console.log(`🎬 MiniMax H3 Local Studio is running at: ${url}`);
  console.log("Press Ctrl+C to stop.");
  console.log("==============================================================");

  if (!process.env.MINIMAX_STUDIO_NO_OPEN) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    execFile(opener, [url], () => {});
  }
});
