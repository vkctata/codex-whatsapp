# WhatsApp for Codex

[![CI](https://github.com/vkctata/codex-whatsapp/actions/workflows/ci.yml/badge.svg)](https://github.com/vkctata/codex-whatsapp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An open-source Codex plugin that connects to your local WhatsApp Web session, enforces self-only or explicitly whitelisted sending, and accepts wake-name text or explicitly armed voice commands only from your own self-chat.

> [!IMPORTANT]
> This is an independent, unofficial project. It is not affiliated with or endorsed by WhatsApp, Meta, OpenAI, or ChatGPT. It uses WhatsApp Web through `whatsapp-web.js`, which may break when WhatsApp changes and may carry account or terms-of-service risk. Do not use it for spam, bulk messaging, surveillance, or bypassing platform controls.

## What it exposes to Codex

- `whatsapp_status` — read the connection and redacted policy state
- `configure_onboarding` — choose the bot name and polling interval before authentication
- `connect_whatsapp` — start WhatsApp Web and return a scannable QR code
- `use_self_only_mode` — clear the whitelist and restrict sends to yourself
- `allow_whatsapp_recipient` / `remove_whatsapp_recipient` — manage explicit recipient consent
- `send_whatsapp_message` — send one approved plain-text message only when policy permits
- `configure_owner_commands` / `claim_owner_commands` — process wake-name text or armed voice commands only from your self-chat

The MCP server runs locally. WhatsApp session credentials and recipient policy are stored outside the repository at `~/.codex-whatsapp/` by default. It provides no tools for contact lists, groups, other chats, or message history. When owner commands are enabled, it reads only wake-name text or one voice note explicitly armed by a preceding wake message in your self-chat.

## Requirements

- Codex or the ChatGPT desktop app with local plugins/MCP support
- Node.js 22 or newer (Node.js 22 or 24 LTS recommended)
- Google Chrome or Chromium
- A WhatsApp account and phone capable of scanning a Linked Devices QR code

## Install in one command

Clone or download the repository, open a terminal in its folder, and run:

```bash
node scripts/install.mjs
```

The installer works on macOS, Windows, and Linux. It installs dependencies, runs tests, registers the local marketplace, and opens the plugin page. Click **Install**, restart the Codex/ChatGPT desktop app, open a new task, and ask:

> Set up my private WhatsApp assistant

Scan the returned QR code in WhatsApp under **Settings → Linked devices → Link a device**. The saved session is reused, so this is normally a one-time step.

Onboarding asks for a bot name and polling interval before showing the QR. Sending defaults to your linked number only. To use WhatsApp as a private command inbox, see [Owner-command automation](docs/AUTOMATION.md).

## Manual install

```bash
git clone https://github.com/vkctata/codex-whatsapp.git
cd codex-whatsapp/plugins/codex-whatsapp
PUPPETEER_SKIP_DOWNLOAD=true npm ci
cd ../..
codex plugin marketplace add .
```

Open the **Codex Whatsapp Local** marketplace in the app’s plugin directory, install **WhatsApp for Codex**, restart the app, and open a new task. Ask: **Set up my private WhatsApp assistant**.

If Chrome is installed somewhere unusual, set `CODEX_WHATSAPP_CHROME_PATH` to its executable path before Codex starts. Set `CODEX_WHATSAPP_DATA_DIR` to override the session directory.

## Development

```bash
cd plugins/codex-whatsapp
PUPPETEER_SKIP_DOWNLOAD=true npm install
npm test
npm run check
npm run test:mcp
npm run validate:plugin
```

Validate the plugin manifest with the Codex plugin-creator validator before release.

To diagnose QR login outside Codex, run `npm run login:test`. It writes a temporary QR PNG, waits up to three minutes for a scan, and reports when the session is ready.

## Security and privacy

- Never commit `~/.codex-whatsapp/` or any WhatsApp session data.
- Review the recipient and exact message before approving a send tool call.
- Prefer self-only mode. Whitelist another number only after the owner explicitly requests it.
- Run this only on a machine and OS account you trust.
- To unlink the session, use WhatsApp **Linked devices** on your phone and log the device out. Then remove `~/.codex-whatsapp/` locally.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
