import type { components } from "./model.openapi";

type Schemas = components["schemas"];

export type ImporterCatalog = Schemas["ImporterCatalog"];
export type ModelImporter = Schemas["ModelImporter"];
export type ModelImporterId = ModelImporter["id"];
export type ModelTaskType = ModelImporter["task"];
export type CreateImportRequest = Schemas["CreateImportRequest"];
export type ImportMetadata = Schemas["ImportMetadata"];
export type ImportTask = Schemas["ImportTask"];
type GeneratedModelList = Schemas["ModelList"];
type GeneratedModelSummary = Schemas["ModelSummary"];
type GeneratedModelDetail = Schemas["ModelDetail"];
type GeneratedDeploymentState = Schemas["DeploymentState"];

export interface ModelSize {
  width: number;
  height: number;
}

export interface ModelSizeConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  widthStep?: number;
  heightStep?: number;
  step?: number;
  presets?: ModelSize[];
}

export interface DeploymentParameters {
  threshold: number;
  processingSize?: ModelSize;
}

export type ModelSummary = GeneratedModelSummary & {
  tensorSize?: ModelSize | null;
  deployment?: DeploymentParameters | null;
  processingSize?: ModelSize | null;
  threshold?: number | null;
};

export type ModelDetail = Omit<GeneratedModelDetail, "deployment"> & {
  tensorSize?: ModelSize | null;
  deployment?: DeploymentParameters | null;
};

export type ModelList = Omit<GeneratedModelList, "models"> & {
  models: ModelSummary[];
};

export type DeploymentState = Omit<
  GeneratedDeploymentState,
  "parameters" | "appliedParameters"
> & {
  parameters: DeploymentParameters;
  appliedParameters: DeploymentParameters | null;
  processingSizeConstraints?: ModelSizeConstraints;
};
export type AcceptedTask = Schemas["AcceptedTask"];
export type ModelTask = Schemas["Task"];

export interface RuntimeJsonSchema {
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, RuntimeJsonSchema>;
  items?: RuntimeJsonSchema;
  allOf?: RuntimeJsonSchema[];
  enum?: Array<string | number | boolean>;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  uniqueItems?: boolean;
  pattern?: string;
  step?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  description?: string;
  constraints?: ModelSizeConstraints;
  presets?: ModelSize[];
}

export interface ImportFormSubmission {
  importer: ModelImporter;
  name: string;
  file: File;
  metadata: ImportMetadata;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadHandle {
  promise: Promise<ImportTask>;
  cancel(): void;
}

export type ModelWorkspaceView =
  | { type: "list" }
  | { type: "choose-task" }
  | { type: "choose-importer"; task: ModelTaskType }
  | { type: "import"; importerId: ModelImporterId }
  | { type: "import-task"; importId: string }
  | { type: "detail"; modelId: string }
  | { type: "deployment"; modelId: string };
