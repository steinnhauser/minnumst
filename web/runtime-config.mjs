import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, env } from "node:process";

const config = {
  VITE_API_URL: env.VITE_API_URL ?? "",
};

await writeFile(
  resolve(cwd(), "dist/runtime-config.js"),
  `window.__MINNUMST_ENV__ = ${JSON.stringify(config)};\n`,
);
