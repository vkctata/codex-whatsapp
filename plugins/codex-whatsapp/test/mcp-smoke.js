import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, "..", "src", "server.js")]
});
const client = new Client({ name: "codex-whatsapp-smoke", version: "0.1.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    [
      "allow_whatsapp_recipient",
      "claim_owner_commands",
      "configure_owner_commands",
      "connect_whatsapp",
      "remove_whatsapp_recipient",
      "send_whatsapp_message",
      "use_self_only_mode",
      "whatsapp_privacy_policy",
      "whatsapp_status"
    ].sort()
  );
  process.stdout.write(`MCP smoke test passed (${tools.length} tools).\n`);
} finally {
  await client.close();
}
