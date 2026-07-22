export type LocalRequestInit = RequestInit & {
  targetAddressSpace?: "local";
};

export class LocalRequestTimeoutError extends Error {
  constructor() {
    super("Local device request timed out");
    this.name = "LocalRequestTimeoutError";
  }
}

interface LocalFetchOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  retry?: boolean;
}

const RETRY_DELAYS_MS = [0, 300, 800] as const;

export function isLinuxDesktopChromium(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  return (
    /Linux/.test(userAgent) &&
    !/Android/.test(userAgent) &&
    /Chrome|Chromium|Edg\//.test(userAgent)
  );
}

export function createLocalRequestInit(
  init: RequestInit = {},
): LocalRequestInit {
  const requestInit: LocalRequestInit = {
    mode: "cors",
    cache: "no-store",
    ...init,
  };
  if (isLinuxDesktopChromium()) {
    requestInit.targetAddressSpace = "local";
  }
  return requestInit;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function isPermissionError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

function isTransientNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === "NetworkError")
  );
}

async function waitForRetry(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = window.setTimeout(finish, delayMs);
    const abort = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(abortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function fetchLocalDevice(
  input: RequestInfo | URL,
  init: RequestInit,
  options: LocalFetchOptions,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = options.retry && method === "GET" ? RETRY_DELAYS_MS.length : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await waitForRetry(RETRY_DELAYS_MS[attempt], options.signal);
    }
    if (options.signal?.aborted) throw abortError();

    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
    const abortFromParent = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromParent, { once: true });

    try {
      return await fetch(
        input,
        createLocalRequestInit({ ...init, signal: controller.signal }),
      );
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      if (isPermissionError(error)) throw error;

      const retryable = timedOut || isTransientNetworkError(error);
      if (retryable && attempt + 1 < attempts) continue;
      if (timedOut) throw new LocalRequestTimeoutError();
      throw error;
    } finally {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromParent);
    }
  }

  throw new TypeError("Failed to fetch");
}
