import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qrPath = path.resolve(
  process.env.CODEX_WHATSAPP_QR_PATH || path.join(os.tmpdir(), "codex-whatsapp-login.png")
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(pluginRoot, "src", "server.js")]
});
const client = new Client({ name: "codex-whatsapp-login-test", version: "0.1.0" });

try {
  await client.connect(transport);
  const login = await client.callTool({ name: "connect_whatsapp", arguments: {} });
  const image = login.content.find((item) => item.type === "image");
  const text = login.content.find((item) => item.type === "text");
  if (text) process.stdout.write(`${text.text}\n`);

  if (image) {
    await fs.writeFile(qrPath, Buffer.from(image.data, "base64"), { mode: 0o600 });
    process.stdout.write(`QR_PATH=${qrPath}\n`);
  }

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const result = await client.callTool({ name: "whatsapp_status", arguments: {} });
    const status = result.content.find((item) => item.type === "text")?.text || "";
    const firstLine = status.split("\n", 1)[0];
    process.stdout.write(`${firstLine}\n`);
    if (status.includes("Status: ready.")) {
      process.stdout.write("WhatsApp login verified.\n");
      process.exitCode = 0;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
} finally {
  await client.close();
}
