import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8")
);
const mcp = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"));

assert.equal(manifest.name, path.basename(root));
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(manifest.mcpServers, "./.mcp.json");
assert.ok(mcp.mcpServers?.whatsapp, "WhatsApp MCP server configuration is missing");
assert.ok(fs.existsSync(path.join(root, "skills", "whatsapp-messaging", "SKILL.md")));
process.stdout.write("Plugin structure validation passed.\n");
