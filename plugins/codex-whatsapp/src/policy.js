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
      prefix: "/codex ",
      startedAt: null,
      processedIds: []
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
