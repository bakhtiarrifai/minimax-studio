#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_PATH = path.resolve(__dirname, "mcp.js");

console.log("==============================================================");
console.log("Registering MiniMax H3 Studio MCP Server across AI assistants");
console.log(`Path: ${MCP_PATH}`);
console.log("==============================================================");

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      resolve({ success: !err, output: stdout || stderr });
    });
  });
}

// 1. Antigravity CLI (agy)
console.log("\n-> Registering with Antigravity (agy)...");
const agyRes = await run("agy", ["mcp", "add", "minimax", "node", MCP_PATH]);
console.log(agyRes.output.trim() || (agyRes.success ? "Registered with agy!" : "agy CLI not found or failed"));

// 2. Claude Code
console.log("\n-> Registering with Claude Code...");
const claudeRes = await run("claude", ["mcp", "add", "--scope", "user", "minimax", "--", "node", MCP_PATH]);
console.log(claudeRes.output.trim() || (claudeRes.success ? "Registered with Claude Code!" : "claude CLI not found or failed"));

// 3. Codex CLI
console.log("\n-> Registering with Codex...");
const codexRes = await run("codex", ["mcp", "add", "minimax", "--", "node", MCP_PATH]);
console.log(codexRes.output.trim() || (codexRes.success ? "Registered with Codex!" : "codex CLI not found or failed"));

// 4. Gemini CLI
console.log("\n-> Registering with Gemini CLI...");
const geminiRes = await run("gemini", ["mcp", "add", "--scope", "user", "minimax", "node", MCP_PATH]);
console.log(geminiRes.output.trim() || (geminiRes.success ? "Registered with Gemini CLI!" : "gemini CLI not found or failed"));

// 5. Claude Desktop config (~/.config/Claude/claude_desktop_config.json)
const claudeDesktopConfigPath = path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
try {
  let config = {};
  try {
    config = JSON.parse(await fs.readFile(claudeDesktopConfigPath, "utf-8"));
  } catch {}
  config.mcpServers = config.mcpServers || {};
  config.mcpServers.minimax = {
    command: "node",
    args: [MCP_PATH],
  };
  await fs.mkdir(path.dirname(claudeDesktopConfigPath), { recursive: true });
  await fs.writeFile(claudeDesktopConfigPath, JSON.stringify(config, null, 2), "utf-8");
  console.log("\n-> Added to Claude Desktop config successfully!");
} catch (err) {
  console.log(`\nNote: Claude Desktop config skipped: ${err.message}`);
}

console.log("\nRegistration complete! Restart your assistants to use 'minimax' MCP tools.");
