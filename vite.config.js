import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Version and "last updated" stamp for the main menu, read from git at build
// time so every commit (and every Pages deploy) updates it automatically.
// Version is package.json's major.minor plus the commit count as the patch.
const git = (cmd, fallback) => {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
};
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
const [major, minor] = version.split(".");
const build = {
  version: `${major}.${minor}.${git("rev-list --count HEAD", "0")}`,
  commit: git("rev-parse --short HEAD", ""),
  date: git("log -1 --format=%cI", new Date().toISOString()),
};

export default {
  server: {
    port: 5174,
  },
  define: {
    __BUILD__: JSON.stringify(build),
  },
};
