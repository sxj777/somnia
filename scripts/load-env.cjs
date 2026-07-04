const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function loadEnvFile(fileName) {
  const envPath = resolve(process.cwd(), fileName);
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();

    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
}

module.exports = { loadEnvFile, loadLocalEnv };
