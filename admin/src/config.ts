export type AppEnvironment = {
  DEBUG?: string;
  VITE_API_URL?: string;
};

export function parseAppConfig(env: AppEnvironment) {
  return {
    apiUrl: env.VITE_API_URL?.trim() ?? "",
    debug: env.DEBUG?.trim().toLowerCase() === "true",
  };
}

export const appConfig = parseAppConfig(__EFTIRMAL_ENV__);
