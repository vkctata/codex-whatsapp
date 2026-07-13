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
  normalizeWakeName,
  parseWakeText,
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
    const defaults = defaultPolicy();
    policy = {
      ...defaults,
      ownerNumber: linkedNumber,
      inbound: {
        ...defaults.inbound,
        wakeName: policy.inbound.wakeName,
        pollIntervalMinutes: policy.inbound.pollIntervalMinutes
      }
    };
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
    `Bot name: ${policy.inbound.wakeName || "not configured"}.`,
    `Polling interval: ${policy.inbound.pollIntervalMinutes || "not configured"}${policy.inbound.pollIntervalMinutes ? " minutes" : ""}.`,
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
  { name: "codex-whatsapp", version: "0.2.0" },
  {
    instructions:
      "Onboarding must choose a bot wake name and polling interval before WhatsApp authentication. Privacy boundary: sending defaults to the linked account's own number only. Never send unless policy allows it and the user approved the exact message. Do not expose history, other chats, groups, or contacts. Owner automation claims only wake-name text commands or one voice note immediately following a wake-only text in the owner's self-chat."
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
  "onboarding_status",
  {
    title: "WhatsApp onboarding status",
    description: "Check whether the bot wake name and polling interval are configured before authentication.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => {
    const policy = loadPolicy(DATA_DIR);
    const complete = Boolean(policy.inbound.wakeName && policy.inbound.pollIntervalMinutes);
    return textResult(
      JSON.stringify(
        {
          complete,
          botName: policy.inbound.wakeName,
          pollIntervalMinutes: policy.inbound.pollIntervalMinutes,
          nextStep: complete ? "connect_whatsapp" : "configure_onboarding"
        },
        null,
        2
      )
    );
  }
);

server.registerTool(
  "configure_onboarding",
  {
    title: "Configure WhatsApp bot onboarding",
    description: "Choose the private bot wake name and a safe polling interval before QR authentication.",
    inputSchema: {
      botName: z.string().describe("Wake name, for example Nova"),
      pollIntervalMinutes: z
        .number()
        .int()
        .refine((value) => [1, 2, 5, 10, 15].includes(value), {
          message: "Choose 1, 2, 5, 10, or 15 minutes."
        })
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ botName, pollIntervalMinutes }) => {
    const policy = loadPolicy(DATA_DIR);
    policy.inbound.wakeName = normalizeWakeName(botName);
    policy.inbound.pollIntervalMinutes = pollIntervalMinutes;
    policy.inbound.enabled = false;
    policy.inbound.startedAt = null;
    policy.inbound.processedIds = [];
    policy.inbound.voiceArmedAt = null;
    policy.inbound.voiceArmedUntil = null;
    savePolicy(DATA_DIR, policy);
    return textResult(
      `Onboarding saved. Bot name: ${policy.inbound.wakeName}. Poll every ${pollIntervalMinutes} minutes. Next: connect WhatsApp by QR. Owner-command reading remains disabled until authentication succeeds and the user enables it.`
    );
  }
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
    const policy = loadPolicy(DATA_DIR);
    if (!policy.inbound.wakeName || !policy.inbound.pollIntervalMinutes) {
      throw new Error(
        "Onboarding is incomplete. Ask the user for a bot name and polling interval, then run configure_onboarding before QR authentication."
      );
    }
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
      `${policyText()}\nOnly the owner's self-chat is read, and only when owner-command automation is enabled. Text must begin with the configured bot name. A voice note is accepted only immediately after a wake-only text within two minutes.`
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
    description: "Enable or disable commands read only from the owner's self-chat using the configured wake name.",
    inputSchema: {
      enabled: z.boolean(),
      botName: z.string().optional(),
      pollIntervalMinutes: z
        .number()
        .int()
        .refine((value) => [1, 2, 5, 10, 15].includes(value), {
          message: "Choose 1, 2, 5, 10, or 15 minutes."
        })
        .optional()
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ enabled, botName, pollIntervalMinutes }) => {
    const activeClient = await requireReady();
    const policy = attachOwner(activeClient);
    if (botName) policy.inbound.wakeName = normalizeWakeName(botName);
    if (pollIntervalMinutes) policy.inbound.pollIntervalMinutes = pollIntervalMinutes;
    if (!policy.inbound.wakeName || !policy.inbound.pollIntervalMinutes) {
      throw new Error("Complete onboarding with a bot name and polling interval first.");
    }
    policy.inbound.enabled = enabled;
    policy.inbound.startedAt = enabled ? Date.now() : null;
    policy.inbound.processedIds = [];
    policy.inbound.voiceArmedAt = null;
    policy.inbound.voiceArmedUntil = null;
    savePolicy(DATA_DIR, policy);
    return textResult(
      `Owner-command automation ${enabled ? "enabled" : "disabled"}. ${
        enabled
          ? `Only new self-chat text beginning with "${policy.inbound.wakeName}" or one voice note following a "${policy.inbound.wakeName}" wake message can be claimed. Poll every ${policy.inbound.pollIntervalMinutes} minutes.`
          : "No WhatsApp messages will be read."
      }`
    );
  }
);

server.registerTool(
  "claim_owner_commands",
  {
    title: "Claim owner WhatsApp commands",
    description: "Claim wake-name text commands or one armed voice note from the linked owner's self-chat.",
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
    const messages = (await chat.fetchMessages({ limit: 50 })).sort(
      (left, right) => left.timestamp - right.timestamp
    );
    const processed = new Set(policy.inbound.processedIds);
    const eligible = messages
      .filter((message) => message.fromMe)
      .filter((message) => message.from === ownerChatId || message.to === ownerChatId)
      .filter((message) => message.timestamp * 1000 >= policy.inbound.startedAt)
      .filter((message) => !processed.has(message.id._serialized));

    const commands = [];
    const audioContent = [];
    const claimedIds = [];
    for (const message of eligible) {
      if (commands.length >= limit) break;
      const messageId = message.id._serialized;
      const messageTime = message.timestamp * 1000;
      const wake = parseWakeText(message.body, policy.inbound.wakeName);

      if (wake?.type === "arm_voice") {
        policy.inbound.voiceArmedAt = messageTime;
        policy.inbound.voiceArmedUntil = messageTime + 120_000;
        claimedIds.push(messageId);
        continue;
      }

      if (wake?.type === "text") {
        commands.push({
          id: messageId,
          type: "text",
          command: wake.command,
          timestamp: new Date(messageTime).toISOString()
        });
        claimedIds.push(messageId);
        continue;
      }

      const isVoice = message.hasMedia && ["ptt", "audio"].includes(message.type);
      const voiceIsArmed =
        policy.inbound.voiceArmedAt &&
        policy.inbound.voiceArmedUntil &&
        messageTime >= policy.inbound.voiceArmedAt &&
        messageTime <= policy.inbound.voiceArmedUntil;
      if (isVoice && voiceIsArmed) {
        const media = await message.downloadMedia();
        if (media?.data) {
          const audioIndex = audioContent.length;
          audioContent.push({
            type: "audio",
            data: media.data,
            mimeType: media.mimetype || "audio/ogg"
          });
          commands.push({
            id: messageId,
            type: "voice",
            audioIndex,
            timestamp: new Date(messageTime).toISOString()
          });
          claimedIds.push(messageId);
          policy.inbound.voiceArmedAt = null;
          policy.inbound.voiceArmedUntil = null;
        }
      }
    }

    if (policy.inbound.voiceArmedUntil && Date.now() > policy.inbound.voiceArmedUntil) {
      policy.inbound.voiceArmedAt = null;
      policy.inbound.voiceArmedUntil = null;
    }

    policy.inbound.processedIds = [
      ...policy.inbound.processedIds,
      ...claimedIds
    ].slice(-500);
    savePolicy(DATA_DIR, policy);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              botName: policy.inbound.wakeName,
              commands,
              voiceArmedUntil: policy.inbound.voiceArmedUntil
                ? new Date(policy.inbound.voiceArmedUntil).toISOString()
                : null
            },
            null,
            2
          )
        },
        ...audioContent
      ]
    };
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
