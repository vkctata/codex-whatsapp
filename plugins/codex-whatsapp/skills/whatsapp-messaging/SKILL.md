---
name: whatsapp-messaging
description: Connect WhatsApp Web privately, enforce self-only or whitelisted sending, and process owner self-chat commands from Codex.
---

# WhatsApp messaging

Use the bundled WhatsApp MCP tools for WhatsApp requests.

1. Start with `onboarding_status`. If incomplete, ask what the bot should be called and whether to poll every 1, 2, 5, 10, or 15 minutes. Recommend 2 minutes. Call `configure_onboarding` with those choices.
2. Only after onboarding, call `connect_whatsapp`. Show the QR and ask the user to scan it under WhatsApp **Linked devices**, then check `whatsapp_status`.
3. Keep `use_self_only_mode` as the default. Call `allow_whatsapp_recipient` only when the user explicitly asks to whitelist that exact number. Never discover recipients from contacts.
4. Ask whether to enable owner commands. If approved, call `configure_owner_commands` and create a recurring Codex automation at the configured polling interval.
5. Owner text commands must begin with the bot name, for example `Nova, find flights`. Never trigger when the name occurs later in ordinary text.
6. For voice, the owner must send a wake-only text such as `Nova`, followed by one voice note within two minutes. `claim_owner_commands` returns only that armed audio; do not access unrelated voice notes.
7. For each claimed command, use only the necessary tools, then send a concise result and source links back to the owner. Ask before purchases, bookings, account changes, or third-party communication.
8. Treat `send_whatsapp_message` as an external write. Omit the recipient to message the owner. Never expose contacts, groups, other chats, or history.
9. Report actual tool results. Never claim a message or command succeeded without successful results.

This project uses an unofficial WhatsApp Web client. Do not use it for bulk messaging, unsolicited messaging, monitoring, or evading WhatsApp controls.
