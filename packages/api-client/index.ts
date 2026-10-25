export type { components, paths } from "./openapi";

export type ApiError = Error & { status?: number; requestId: string };

type ClientOptions = {
  baseUrl: string;
  // "include" sends the Authentik session cookie to the API's own hostname.
  credentials?: RequestCredentials;
};

// One fetch wrapper for both frontends. Every request carries an X-Request-ID
// that the API logs, JSON headers are sent only with a body (so reads need no
// CORS preflight), and errors carry the API's own message and the request ID.
export function createRequest({
  baseUrl,
  credentials = "same-origin",
}: ClientOptions) {
  let root = baseUrl;
  while (root.endsWith("/")) root = root.slice(0, -1);

  return async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const requestId = crypto.randomUUID();
    const headers = new Headers(init.headers);
    headers.set("X-Request-ID", requestId);
    if (init.body !== undefined)
      headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await fetch(`${root}${path}`, {
        ...init,
        headers,
        credentials,
      });
    } catch {
      throw apiError(
        "Could not reach the Minnumst API. Check that it is running.",
        requestId,
      );
    }
    if (!response.ok) throw await errorFromResponse(response, requestId);
    return (response.status === 204 ? undefined : await response.json()) as T;
  };
}

async function errorFromResponse(
  response: Response,
  requestId: string,
): Promise<ApiError> {
  let message = `The Minnumst API returned ${response.status}.`;
  try {
    const { detail } = (await response.json()) as { detail?: unknown };
    if (typeof detail === "string") message = detail;
    // Validation errors (422) list each problem; the first is the most useful.
    else if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
      message = detail[0].msg;
    }
  } catch {
    // Not JSON: keep the status message.
  }
  const error = apiError(
    message,
    response.headers.get("X-Request-ID") ?? requestId,
  );
  error.status = response.status;
  return error;
}

function apiError(message: string, requestId: string): ApiError {
  return Object.assign(new Error(message), { requestId });
}
