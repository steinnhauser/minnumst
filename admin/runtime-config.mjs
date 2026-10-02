import { writeFile } from "node:fs/promises";

const config = {
  VITE_API_URL: process.env.VITE_API_URL ?? "",
  DEBUG: process.env.DEBUG ?? "false",
};

await writeFile(
  new URL("./dist/runtime-config.js", import.meta.url),
  `window.__EFTIRMAL_ENV__ = ${JSON.stringify(config)};\n`,
);
