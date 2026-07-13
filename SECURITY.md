# Security policy

## Reporting a vulnerability

Do not open a public issue containing session data, QR contents, phone numbers, messages, or an exploitable vulnerability. Use the repository's **Security → Report a vulnerability** private advisory flow.

## Sensitive data

WhatsApp authentication state lives in `~/.codex-whatsapp/` unless overridden with `CODEX_WHATSAPP_DATA_DIR`. Treat that directory like a credential. Never attach it to bug reports or commit it to source control.
