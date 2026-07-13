import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = path.join(repoRoot, "plugins", "codex-whatsapp");

function run(command, args, options = {}) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result.status === 0;
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 18) throw new Error("Node.js 18 or newer is required.");

const chromeCandidates =
  process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
      ]
    : process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
        ]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

const hasChrome = chromeCandidates.some((candidate) => fs.existsSync(candidate));
const installEnv = {
  ...process.env,
  ...(hasChrome ? { PUPPETEER_SKIP_DOWNLOAD: "true" } : {})
};

run("npm", ["ci"], { cwd: pluginDir, env: installEnv });
run("npm", ["test"], { cwd: pluginDir });
run("npm", ["run", "test:mcp"], { cwd: pluginDir });
run("npm", ["run", "validate:plugin"], { cwd: pluginDir });

const added = run("codex", ["plugin", "marketplace", "add", repoRoot], {
  allowFailure: true
});
if (!added) {
  process.stdout.write("Marketplace add returned a non-zero status; continuing in case it is already configured.\n");
}

const marketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");
const pluginUrl = `codex://plugins/codex-whatsapp?marketplacePath=${encodeURIComponent(marketplacePath)}`;
let opened = false;
if (process.platform === "darwin") {
  opened = run("open", [pluginUrl], { allowFailure: true });
} else if (process.platform === "win32") {
  opened = run("cmd", ["/c", "start", "", pluginUrl], { allowFailure: true });
} else {
  opened = run("xdg-open", [pluginUrl], { allowFailure: true });
}

process.stdout.write(
  `\nWhatsApp for Codex is ready to install. ${
    opened ? "Click Install on the plugin page that just opened." : `Open this URL in Codex: ${pluginUrl}`
  } Then restart the app, open a new task, and ask: Set up my private WhatsApp assistant\n`
);
