import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneNumber } from "../src/phone.js";

test("normalizes an international phone number", () => {
  assert.equal(normalizePhoneNumber("+44 7700 900 123"), "447700900123");
});

test("rejects implausibly short numbers", () => {
  assert.throws(() => normalizePhoneNumber("123"), /8 to 15 digits/);
});

test("rejects empty recipients", () => {
  assert.throws(() => normalizePhoneNumber(""), /required/);
});
