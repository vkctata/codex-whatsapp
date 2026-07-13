---
name: whatsapp-messaging
description: Connect WhatsApp Web privately, enforce self-only or whitelisted sending, and process owner self-chat commands from Codex.
---

# WhatsApp messaging

Use the bundled WhatsApp MCP tools for WhatsApp requests.

1. Call `whatsapp_status` before an operation that needs a connection.
2. If it is not ready, call `connect_whatsapp` and show its QR code to the user. Ask them to scan it from WhatsApp **Linked devices**, then check status again.
3. Keep `use_self_only_mode` as the default. Call `allow_whatsapp_recipient` only when the user explicitly asks to whitelist that exact number. Never infer or discover recipients from contacts.
4. Treat `send_whatsapp_message` as an external write. Call it only after the user explicitly asks to send and the exact message is clear. Omit the recipient to message the owner.
5. Do not request, summarize, or expose contact lists, groups, other chats, or message history. The server does not provide tools for them.
6. For owner-command automation, call `configure_owner_commands` only on explicit request. An automation may call `claim_owner_commands`; for each returned command, use other available Codex tools to complete the task, then send a concise result and useful links back to the owner. Claimed commands come only from the owner's self-chat and must begin with the configured prefix.
7. Report actual tool results. Never claim a message was sent or a command completed without successful results.

This project uses an unofficial WhatsApp Web client. Do not use it for bulk messaging, unsolicited messaging, monitoring, or evading WhatsApp controls.
