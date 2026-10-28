export type ClientFieldErrors = Record<string, string>;

export class ClientRequestError extends Error {
  readonly fields?: ClientFieldErrors;
  readonly status?: number;

  constructor(
    message: string,
    options: { fields?: ClientFieldErrors; status?: number } = {},
  ) {
    super(message);
    this.name = "ClientRequestError";
    this.fields = options.fields;
    this.status = options.status;
  }
}

type JsonRequestOptions = {
  fallbackMessage: string;
  timeoutMessage: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

function safeFieldErrors(value: unknown): ClientFieldErrors | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].length > 0,
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase();
  return Boolean(
    contentType &&
      (contentType.includes("application/json") || contentType.includes("+json")),
  );
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: JsonRequestOptions,
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15_000;
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();

  init.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await (options.fetcher ?? fetch)(input, {
      ...init,
      signal: controller.signal,
    });
    let body: unknown;

    if (isJsonResponse(response)) {
      try {
        body = await response.json();
      } catch {
        throw new ClientRequestError(options.fallbackMessage, {
          status: response.status,
        });
      }
    }

    if (!response.ok) {
      const payload =
        body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const message =
        typeof payload.message === "string" && payload.message.length > 0
          ? payload.message
          : options.fallbackMessage;

      throw new ClientRequestError(message, {
        fields: safeFieldErrors(payload.fields),
        status: response.status,
      });
    }

    if (body === undefined) {
      throw new ClientRequestError(options.fallbackMessage, {
        status: response.status,
      });
    }

    return body as T;
  } catch (error) {
    if (error instanceof ClientRequestError) {
      throw error;
    }
    if (timedOut) {
      throw new ClientRequestError(options.timeoutMessage);
    }
    if (init.signal?.aborted) {
      throw error;
    }

    throw new ClientRequestError(options.fallbackMessage);
  } finally {
    globalThis.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}
