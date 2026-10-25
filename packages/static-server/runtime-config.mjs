import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, env } from "node:process";

// Writes dist/runtime-config.js from the environment variables named on the
// command line, so one image works in every environment. Only list values that
// are safe to publish: the file is served to every browser.
const keys = argv.slice(2);
if (keys.length === 0) throw new Error("Name at least one variable to expose");

const config = Object.fromEntries(keys.map((key) => [key, env[key] ?? ""]));

await writeFile(
  resolve(cwd(), "dist/runtime-config.js"),
  `window.__MINNUMST_ENV__ = ${JSON.stringify(config)};\n`,
);
