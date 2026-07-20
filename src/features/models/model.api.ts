import type {
  AcceptedTask,
  CreateImportRequest,
  DeploymentParameters,
  DeploymentState,
  ImportTask,
  ImporterCatalog,
  ModelDetail,
  ModelList,
  ModelTask,
  UploadHandle,
  UploadProgress,
} from "./model.types";

const REQUEST_TIMEOUT_MS = 8_000;

export class ModelApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ModelApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  csrf?: boolean;
  signal?: AbortSignal;
}

async function requestModelApi<T>(
  apiBaseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });

  const headers: Record<string, string> = {};
  if (options.csrf) headers["X-OVIS-CSRF"] = "1";
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
      method: options.method ?? "GET",
      mode: "cors",
      cache: "no-store",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      let message = `Model API returned HTTP ${response.status}`;
      try {
        const body = (await response.json()) as {
          error?: string;
          message?: string;
          validationError?: string;
        };
        message = body.validationError ?? body.message ?? body.error ?? message;
      } catch {
        // Keep the status-based message when the error body is unavailable.
      }
      throw new ModelApiError(message, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ModelApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ModelApiError("Model request timed out");
    }
    throw new ModelApiError(
      error instanceof Error ? error.message : "Unable to reach the model API",
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

export const getModelImporters = (apiBaseUrl: string, signal?: AbortSignal) =>
  requestModelApi<ImporterCatalog>(apiBaseUrl, "/models/importers", { signal });

export const createModelImport = (
  apiBaseUrl: string,
  request: CreateImportRequest,
  signal?: AbortSignal,
) =>
  requestModelApi<ImportTask>(apiBaseUrl, "/models/imports", {
    method: "POST",
    csrf: true,
    body: request,
    signal,
  });

export const getModelImport = (
  apiBaseUrl: string,
  importId: string,
  signal?: AbortSignal,
) =>
  requestModelApi<ImportTask>(apiBaseUrl, `/models/imports/${importId}`, {
    signal,
  });

export const cancelModelImport = (
  apiBaseUrl: string,
  importId: string,
  signal?: AbortSignal,
) =>
  requestModelApi<void>(apiBaseUrl, `/models/imports/${importId}`, {
    method: "DELETE",
    csrf: true,
    signal,
  });

export function uploadModelContent(
  apiBaseUrl: string,
  importId: string,
  file: Blob,
  onProgress: (progress: UploadProgress) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<ImportTask>((resolve, reject) => {
    xhr.open(
      "PUT",
      `${apiBaseUrl.replace(/\/$/, "")}/models/imports/${importId}/content`,
    );
    xhr.setRequestHeader("X-OVIS-CSRF", "1");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size;
      onProgress({
        loaded: event.loaded,
        total,
        percent: total > 0 ? Math.min(100, (event.loaded / total) * 100) : 0,
      });
    };
    xhr.onerror = () => reject(new ModelApiError("Model upload failed"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let message = `Model upload returned HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText) as {
            error?: string;
            message?: string;
            validationError?: string;
          };
          message = body.validationError ?? body.message ?? body.error ?? message;
        } catch {
          // Keep the status-based message.
        }
        reject(new ModelApiError(message, xhr.status));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as ImportTask);
      } catch {
        reject(new ModelApiError("The upload response was invalid"));
      }
    };
    xhr.send(file);
  });
  return { promise, cancel: () => xhr.abort() };
}

export const commitModelImport = (
  apiBaseUrl: string,
  importId: string,
  signal?: AbortSignal,
) =>
  requestModelApi<ModelDetail>(apiBaseUrl, `/models/imports/${importId}/commit`, {
    method: "POST",
    csrf: true,
    signal,
  });

export const listModels = (
  apiBaseUrl: string,
  signal?: AbortSignal,
) => requestModelApi<ModelList>(apiBaseUrl, "/models", { signal });

export const getModel = (
  apiBaseUrl: string,
  modelId: string,
  signal?: AbortSignal,
) =>
  requestModelApi<ModelDetail>(apiBaseUrl, `/models/${modelId}`, {
    signal,
  });

export const deleteModel = (
  apiBaseUrl: string,
  modelId: string,
  signal?: AbortSignal,
) =>
  requestModelApi<void>(apiBaseUrl, `/models/${modelId}`, {
    method: "DELETE",
    csrf: true,
    signal,
  });

export const getModelDeployment = (
  apiBaseUrl: string,
  modelId: string,
  signal?: AbortSignal,
) =>
  requestModelApi<DeploymentState>(apiBaseUrl, `/models/${modelId}/deployment`, {
    signal,
  });

export const updateModelDeployment = (
  apiBaseUrl: string,
  modelId: string,
  parameters: DeploymentParameters,
  signal?: AbortSignal,
) =>
  requestModelApi<DeploymentState>(apiBaseUrl, `/models/${modelId}/deployment`, {
    method: "PUT",
    csrf: true,
    body: parameters,
    signal,
  });

export const activateModel = (
  apiBaseUrl: string,
  modelId: string,
  signal?: AbortSignal,
) =>
  requestModelApi<AcceptedTask>(apiBaseUrl, `/models/${modelId}/activate`, {
    method: "POST",
    csrf: true,
    signal,
  });

export const deactivateModel = (
  apiBaseUrl: string,
  modelId: string,
  signal?: AbortSignal,
) =>
  requestModelApi<AcceptedTask>(apiBaseUrl, `/models/${modelId}/deactivate`, {
    method: "POST",
    csrf: true,
    signal,
  });

export const getModelTask = (
  apiBaseUrl: string,
  taskId: number,
  signal?: AbortSignal,
) => requestModelApi<ModelTask>(apiBaseUrl, `/tasks/${taskId}`, { signal });
