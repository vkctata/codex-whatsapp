# Privacy policy

Effective date: 13 July 2026

WhatsApp for Codex is local, open-source software. The project operator does not run a service that receives or stores your WhatsApp credentials, contacts, or messages.

The plugin launches WhatsApp Web on your machine. Authentication state and recipient policy are stored locally in `~/.codex-whatsapp/` unless you configure another directory. Sending defaults to the linked account's own number; other numbers must be explicitly whitelisted. The plugin exposes no contact-list, group, other-chat, or message-history tools. If owner-command automation is enabled, it reads only new wake-name text from the owner's self-chat. It downloads one voice note only when the owner first sends the wake name alone and follows it with that voice note within two minutes. Unarmed voice notes are not downloaded. A message is provided to WhatsApp only when the send tool is invoked. WhatsApp and Meta process data under their own policies. Codex or ChatGPT may process claimed text or audio under the terms of the product and account you use.

The software does not include project-operated analytics or advertising trackers. GitHub may process repository visits and issue activity under GitHub's policies.

To remove local data, unlink the device in WhatsApp under **Linked devices**, stop the plugin, and delete `~/.codex-whatsapp/`.

Privacy questions can be opened as a GitHub issue only when they contain no personal or session data. Report sensitive matters through GitHub's private vulnerability-reporting flow.
