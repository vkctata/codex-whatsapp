import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultPolicy,
  isRecipientAllowed,
  maskNumber,
  normalizeWakeName,
  parseWakeText
} from "../src/policy.js";

test("self-only mode allows only the owner", () => {
  const policy = { ...defaultPolicy(), ownerNumber: "447700900123" };
  assert.equal(isRecipientAllowed(policy, "447700900123"), true);
  assert.equal(isRecipientAllowed(policy, "14155550100"), false);
});

test("whitelist mode allows explicitly listed numbers", () => {
  const policy = {
    ...defaultPolicy(),
    mode: "whitelist",
    ownerNumber: "447700900123",
    allowedNumbers: ["14155550100"]
  };
  assert.equal(isRecipientAllowed(policy, "14155550100"), true);
  assert.equal(isRecipientAllowed(policy, "14155550101"), false);
});

test("a missing owner denies every recipient", () => {
  assert.equal(isRecipientAllowed(defaultPolicy(), "447700900123"), false);
});

test("masks all but the last four digits", () => {
  assert.equal(maskNumber("447700900123"), "+••••0123");
});

test("normalizes a safe wake name", () => {
  assert.equal(normalizeWakeName("  My   Nova  "), "My Nova");
  assert.throws(() => normalizeWakeName("!"), /2 to 24/);
});

test("parses strict wake-name commands", () => {
  assert.deepEqual(parseWakeText("Nova, find flights", "Nova"), {
    type: "text",
    command: "find flights"
  });
  assert.deepEqual(parseWakeText("hey nova", "Nova"), {
    type: "arm_voice",
    command: null
  });
  assert.equal(parseWakeText("A note mentioning Nova later", "Nova"), null);
});
