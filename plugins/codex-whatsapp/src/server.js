import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import QRCode from "qrcode";
import whatsappWeb from "whatsapp-web.js";
import { normalizePhoneNumber } from "./phone.js";
import {
  defaultPolicy,
  isRecipientAllowed,
  loadPolicy,
  maskNumber,
  savePolicy
} from "./policy.js";

const { Client, LocalAuth } = whatsappWeb;
const DATA_DIR = path.resolve(
  process.env.CODEX_WHATSAPP_DATA_DIR || path.join(os.homedir(), ".codex-whatsapp")
);

let client = null;
let lifecycle = "stopped";
let lastQr = null;
let lastError = null;
let initializationPromise = null;

function chromeExecutable() {
  if (process.env.CODEX_WHATSAPP_CHROME_PATH) return process.env.CODEX_WHATSAPP_CHROME_PATH;

  const candidates =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium"
        ]
      : process.platform === "win32"
        ? [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function attachOwner(activeClient) {
  const linkedNumber = normalizePhoneNumber(activeClient.info?.wid?.user);
  let policy = loadPolicy(DATA_DIR);

  if (policy.ownerNumber !== linkedNumber) {
    policy = { ...defaultPolicy(), ownerNumber: linkedNumber };
    savePolicy(DATA_DIR, policy);
  }
  return policy;
}

function createClient() {
  const executablePath = chromeExecutable();
  const instance = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(DATA_DIR, "session") }),
    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
  });

  instance.on("qr", (qr) => {
    lastQr = qr;
    lastError = null;
    lifecycle = "qr_ready";
  });
  instance.on("authenticated", () => {
    lifecycle = "authenticated";
    lastError = null;
  });
  instance.on("ready", () => {
    lifecycle = "ready";
    lastQr = null;
    lastError = null;
    try {
      attachOwner(instance);
    } catch (error) {
      lastError = `Connected, but owner policy setup failed: ${error.message}`;
    }
  });
  instance.on("auth_failure", (message) => {
    lifecycle = "auth_failure";
    lastError = String(message);
  });
  instance.on("disconnected", (reason) => {
    lifecycle = "disconnected";
    lastError = String(reason);
    client = null;
    initializationPromise = null;
  });

  return instance;
}

async function ensureStarted() {
  if (client && initializationPromise) return initializationPromise;

  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  lifecycle = "starting";
  lastError = null;
  client = createClient();
  initializationPromise = client.initialize().catch((error) => {
    lifecycle = "error";
    lastError = error instanceof Error ? error.message : String(error);
    client = null;
    initializationPromise = null;
    throw error;
  });
  return initializationPromise;
}

function waitForLoginState(timeoutMs = 30000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (["qr_ready", "ready", "auth_failure", "error"].includes(lifecycle)) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 200);
  });
}

function policyText(policy = loadPolicy(DATA_DIR)) {
  const allowed = policy.mode === "self_only" ? 1 : 1 + policy.allowedNumbers.length;
  return [
    `Send policy: ${policy.mode}.`,
    `Owner: ${maskNumber(policy.ownerNumber)}.`,
    `Allowed recipients: ${allowed}.`,
    `Owner-command automation: ${policy.inbound.enabled ? "enabled" : "disabled"}.`,
    "Message history and other chats are not exposed."
  ].join("\n");
}

function statusText() {
  const details = [`Status: ${lifecycle}.`, `Session data: ${DATA_DIR}`, policyText()];
  if (lastError) details.push(`Last error: ${lastError}`);
  return details.join("\n");
}

async function requireReady() {
  if (lifecycle !== "ready" || !client) {
    throw new Error("WhatsApp is not connected. Run connect_whatsapp first and scan its QR code.");
  }
  attachOwner(client);
  return client;
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

const server = new McpServer(
  { name: "codex-whatsapp", version: "0.1.0" },
  {
    instructions:
      "Privacy boundary: sending defaults to the linked account's own number only. Never send to a number unless the server policy allows it and the user explicitly approved the exact message. Do not ask for or expose WhatsApp message history, other chats, groups, or contacts. Owner-command automation may claim only prefixed commands from the owner's self-chat. Sending is irreversible external communication."
  }
);

server.registerTool(
  "whatsapp_status",
  {
    title: "WhatsApp connection and privacy status",
    description: "Check connection state and a redacted summary of the enforced recipient policy.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => textResult(statusText())
);

server.registerTool(
  "connect_whatsapp",
  {
    title: "Connect WhatsApp",
    description: "Start the local WhatsApp Web session and return a QR code when a phone scan is needed.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => {
    void ensureStarted().catch(() => {});
    await waitForLoginState();

    if (lifecycle === "ready") {
      return textResult(`WhatsApp is connected and ready.\n${policyText()}`);
    }
    if (!lastQr) return textResult(statusText());

    const dataUrl = await QRCode.toDataURL(lastQr, { width: 512, margin: 2 });
    return {
      content: [
        {
          type: "text",
          text: "Open WhatsApp on your phone, go to Linked devices, choose Link a device, and scan this QR code. Sending will default to self-only after linking."
        },
        { type: "image", data: dataUrl.split(",", 2)[1], mimeType: "image/png" }
      ]
    };
  }
);

server.registerTool(
  "whatsapp_privacy_policy",
  {
    title: "WhatsApp privacy policy",
    description: "Show the redacted send policy and the data this plugin can access.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () =>
    textResult(
      `${policyText()}\nOnly the owner's self-chat is read, and only when owner-command automation is enabled. Only messages beginning with the configured command prefix are returned.`
    )
);

server.registerTool(
  "use_self_only_mode",
  {
    title: "Use self-only WhatsApp mode",
    description: "Restrict all sends to the linked account's own WhatsApp number and clear the whitelist.",
    inputSchema: {},
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => {
    const activeClient = await requireReady();
    const policy = attachOwner(activeClient);
    policy.mode = "self_only";
    policy.allowedNumbers = [];
    savePolicy(DATA_DIR, policy);
    return textResult(`Self-only mode enabled for ${maskNumber(policy.ownerNumber)}.`);
  }
);

server.registerTool(
  "allow_whatsapp_recipient",
  {
    title: "Whitelist WhatsApp recipient",
    description: "Explicitly allow one international phone number. The owner's own number remains allowed.",
    inputSchema: {
      recipient: z.string().describe("International phone number with country code")
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ recipient }) => {
    const activeClient = await requireReady();
    const policy = attachOwner(activeClient);
    const digits = normalizePhoneNumber(recipient);
    if (digits !== policy.ownerNumber && !policy.allowedNumbers.includes(digits)) {
      policy.allowedNumbers.push(digits);
    }
    policy.mode = "whitelist";
    savePolicy(DATA_DIR, policy);
    return textResult(`${maskNumber(digits)} is whitelisted. ${policyText(policy)}`);
  }
);

server.registerTool(
  "remove_whatsapp_recipient",
  {
    title: "Remove WhatsApp recipient",
    description: "Remove one phone number from the send whitelist. The owner's own number cannot be removed.",
    inputSchema: {
      recipient: z.string().describe("International phone number with country code")
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ recipient }) => {
    const activeClient = await requireReady();
    const policy = attachOwner(activeClient);
    const digits = normalizePhoneNumber(recipient);
    if (digits === policy.ownerNumber) {
      throw new Error("The owner number cannot be removed. Use self-only mode to clear other numbers.");
    }
    policy.allowedNumbers = policy.allowedNumbers.filter((number) => number !== digits);
    savePolicy(DATA_DIR, policy);
    return textResult(`${maskNumber(digits)} was removed. ${policyText(policy)}`);
  }
);

server.registerTool(
  "configure_owner_commands",
  {
    title: "Configure WhatsApp owner commands",
    description: "Enable or disable commands read only from the owner's self-chat with a strict prefix.",
    inputSchema: {
      enabled: z.boolean(),
      prefix: z
        .string()
        .min(3)
        .max(24)
        .regex(/^\/[a-z0-9_-]+\s$/i, "Use a slash command followed by one space, such as /codex ")
        .optional()
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ enabled, prefix }) => {
    const activeClient = await requireReady();
    const policy = attachOwner(activeClient);
    policy.inbound.enabled = enabled;
    if (prefix) policy.inbound.prefix = prefix;
    policy.inbound.startedAt = enabled ? Date.now() : null;
    policy.inbound.processedIds = [];
    savePolicy(DATA_DIR, policy);
    return textResult(
      `Owner-command automation ${enabled ? "enabled" : "disabled"}. ${
        enabled
          ? `Only new messages in ${maskNumber(policy.ownerNumber)}'s self-chat beginning with "${policy.inbound.prefix}" can be claimed.`
          : "No WhatsApp messages will be read."
      }`
    );
  }
);

server.registerTool(
  "claim_owner_commands",
  {
    title: "Claim owner WhatsApp commands",
    description: "Return and mark processed only new prefixed commands from the linked owner's self-chat.",
    inputSchema: {
      limit: z.number().int().min(1).max(10).default(3)
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async ({ limit }) => {
    const activeClient = await requireReady();
    const policy = attachOwner(activeClient);
    if (!policy.inbound.enabled) {
      throw new Error("Owner-command automation is disabled. No messages were read.");
    }

    const ownerChatId = `${policy.ownerNumber}@c.us`;
    const chat = await activeClient.getChatById(ownerChatId);
    const messages = await chat.fetchMessages({ limit: 50 });
    const processed = new Set(policy.inbound.processedIds);
    const commands = messages
      .filter((message) => message.fromMe)
      .filter((message) => message.from === ownerChatId || message.to === ownerChatId)
      .filter((message) => message.timestamp * 1000 >= policy.inbound.startedAt)
      .filter((message) => message.body.startsWith(policy.inbound.prefix))
      .filter((message) => !processed.has(message.id._serialized))
      .slice(-limit)
      .map((message) => ({
        id: message.id._serialized,
        command: message.body.slice(policy.inbound.prefix.length).trim(),
        timestamp: new Date(message.timestamp * 1000).toISOString()
      }));

    policy.inbound.processedIds = [
      ...policy.inbound.processedIds,
      ...commands.map((command) => command.id)
    ].slice(-500);
    savePolicy(DATA_DIR, policy);
    return textResult(JSON.stringify({ commands }, null, 2));
  }
);

server.registerTool(
  "send_whatsapp_message",
  {
    title: "Send allowed WhatsApp message",
    description: "Send one plain-text message to the owner by default, or to an explicitly whitelisted number.",
    inputSchema: {
      recipient: z
        .string()
        .optional()
        .describe("Optional international phone number. Omit to send to the linked owner."),
      message: z.string().min(1).max(4096).describe("The exact plain-text message to send")
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  async ({ recipient, message }) => {
    const activeClient = await requireReady();
    const policy = attachOwner(activeClient);
    const digits = recipient ? normalizePhoneNumber(recipient) : policy.ownerNumber;
    if (!isRecipientAllowed(policy, digits)) {
      throw new Error(
        `${maskNumber(digits)} is not allowed by the ${policy.mode} policy. Nothing was sent. Explicitly whitelist it first or omit recipient to message yourself.`
      );
    }

    const whatsappId = await activeClient.getNumberId(digits);
    if (!whatsappId) {
      throw new Error(`No WhatsApp account was found for ${maskNumber(digits)}. Nothing was sent.`);
    }

    const result = await activeClient.sendMessage(whatsappId._serialized, message);
    return textResult(
      `Message sent to ${maskNumber(digits)}. WhatsApp message ID: ${result.id._serialized}`
    );
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
