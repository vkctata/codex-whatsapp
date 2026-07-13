import fs from "node:fs";
import path from "node:path";

export function defaultPolicy() {
  return {
    version: 1,
    mode: "self_only",
    ownerNumber: null,
    allowedNumbers: [],
    inbound: {
      enabled: false,
      wakeName: null,
      pollIntervalMinutes: null,
      startedAt: null,
      processedIds: [],
      voiceArmedAt: null,
      voiceArmedUntil: null
    }
  };
}

export function loadPolicy(dataDir) {
  const file = path.join(dataDir, "policy.json");
  if (!fs.existsSync(file)) return defaultPolicy();
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  const defaults = defaultPolicy();
  return {
    ...defaults,
    ...saved,
    allowedNumbers: Array.isArray(saved.allowedNumbers) ? saved.allowedNumbers : [],
    inbound: { ...defaults.inbound, ...(saved.inbound || {}) }
  };
}

export function savePolicy(dataDir, policy) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, "policy.json");
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function isRecipientAllowed(policy, number) {
  if (!policy.ownerNumber) return false;
  if (number === policy.ownerNumber) return true;
  return policy.mode === "whitelist" && policy.allowedNumbers.includes(number);
}

export function maskNumber(number) {
  if (!number) return "not configured";
  return number.length <= 4 ? `+${number}` : `+••••${number.slice(-4)}`;
}

export function normalizeWakeName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{1,23}$/u.test(name)) {
    throw new Error("Choose a bot name with 2 to 24 letters or numbers; spaces, hyphens, and underscores are allowed.");
  }
  return name;
}

export function parseWakeText(body, wakeName) {
  if (!wakeName) return null;
  const escaped = wakeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wakeOnly = new RegExp(`^(?:hey\\s+)?${escaped}[,:]?$`, "iu");
  if (wakeOnly.test(String(body).trim())) return { type: "arm_voice", command: null };

  const command = new RegExp(`^(?:hey\\s+)?${escaped}[,:]?\\s+(.+)$`, "iu").exec(
    String(body).trim()
  );
  return command ? { type: "text", command: command[1].trim() } : null;
}
