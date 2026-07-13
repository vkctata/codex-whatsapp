export function normalizePhoneNumber(value) {
  const input = String(value ?? "").trim();
  if (!input) {
    throw new Error("A recipient phone number is required.");
  }

  const digits = input.replace(/[^0-9]/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error(
      "Use an international phone number with country code (8 to 15 digits), for example +447700900123."
    );
  }

  return digits;
}
