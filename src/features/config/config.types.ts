export interface VideoProfileCapability {
  id: string;
  width: number;
  height: number;
  fps_options: number[];
  bitrate_min: number;
  bitrate_max: number;
}

export interface StreamCapability {
  profiles: VideoProfileCapability[];
}

export type TpuFeatureId =
  | "object"
  | "face"
  | "human_pose"
  | "object_tracking";

export type ObjectTrackingSearchMethod = "color" | "fastsam";

export interface ProcessingSize {
  width: number;
  height: number;
}

export interface ProcessingSizeConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  widthStep?: number;
  heightStep?: number;
  presets?: ProcessingSize[];
}

export interface ProcessingSizeCapability {
  width?: number;
  height?: number;
  fixed?: boolean;
  min_width?: number;
  max_width?: number;
  min_height?: number;
  max_height?: number;
  step?: number;
  default?: ProcessingSize;
  constraints?: ProcessingSizeConstraints;
}

export interface AiFeatureCapability {
  id: string;
  name: string;
  model?: string;
  model_selectable?: boolean;
  search_methods?: ObjectTrackingSearchMethod[];
  processing_size?: ProcessingSizeCapability;
  processingSize?: ProcessingSizeCapability;
  detection_processing_size?: ProcessingSizeCapability;
  detectionProcessingSize?: ProcessingSizeCapability;
  tracking_processing_size?: ProcessingSizeCapability;
  trackingProcessingSize?: ProcessingSizeCapability;
}

export interface AiCapabilities {
  max_active_tpu_features: number;
  features: AiFeatureCapability[];
  motion_detection:
    | boolean
    | {
        supported: boolean;
        processing_size?: ProcessingSizeCapability;
        processingSize?: ProcessingSizeCapability;
      };
  motion_processing_size?: ProcessingSizeCapability;
  motionProcessingSize?: ProcessingSizeCapability;
}

export interface OutputCapabilities {
  rtsp: {
    supported: boolean;
  };
  uvc: {
    supported: boolean;
  };
}

export interface ConfigCapabilities {
  schema_version: number;
  video: {
    main: StreamCapability;
    sub: StreamCapability;
  };
  features: {
    osd: boolean;
    object_detection?: boolean;
    person_detection?: boolean;
    face_detection?: boolean;
    motion_detection?: boolean;
    human_pose?: boolean;
    object_tracking?: boolean;
  };
  ai?: AiCapabilities;
  outputs?: OutputCapabilities;
}

export interface StreamConfigValues {
  profile: string;
  fps: number;
  bitrate_kbps: number;
}

export interface DeviceConfigValues {
  outputs?: {
    rtsp: {
      enabled: boolean;
    };
    uvc: {
      enabled: boolean;
    };
  };
  video: {
    main: StreamConfigValues;
    sub: StreamConfigValues & { enabled: boolean };
  };
  overlay: {
    enabled: boolean;
  };
  detection: {
    object: {
      enabled: boolean;
      threshold: number;
      processing_size: ProcessingSize;
      model: {
        source: "builtin" | "custom";
        id: string;
        runtime_model: string;
      };
    };
    face: {
      enabled: boolean;
      threshold: number;
      processing_size?: ProcessingSize;
    };
    human_pose?: {
      enabled: boolean;
      threshold: number;
      processing_size?: ProcessingSize;
    };
    object_tracking?: {
      enabled: boolean;
      search_method: ObjectTrackingSearchMethod;
      use_kalman: boolean;
      score_threshold: number;
      detection_processing_size?: ProcessingSize;
      tracking_processing_size?: ProcessingSize;
    };
    motion: {
      enabled: boolean;
      sensitivity: number;
      processing_size?: ProcessingSize;
    };
  };
}

export interface DeviceConfigDocument {
  revision: string;
  values: DeviceConfigValues;
}

export interface ConfigPayload {
  revision: string;
  values: DeviceConfigValues;
}

export interface ConfigIssue {
  field: string;
  code: string;
  message: string;
}

export interface ConfigValidationResponse {
  valid: boolean;
  errors: ConfigIssue[];
  warnings: ConfigIssue[];
  requires: string[];
}

export interface SaveConfigResponse {
  saved: boolean;
  revision: string;
  restart_required: boolean;
}

export interface ConfigTaskReference {
  task_id: number;
}

export type ConfigTaskState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface ConfigTask {
  id: number;
  state: ConfigTaskState;
  stage?: string;
  progress?: number;
  message: string;
  rolled_back?: boolean;
}

export type ConfigurationStatus =
  | "loading"
  | "ready"
  | "resetting"
  | "error";

export type ConfigApplicationState =
  | "idle"
  | "validating"
  | "confirming"
  | "saving"
  | "applying"
  | "restart_pending"
  | "reconnecting"
  | "verifying"
  | "success"
  | "failed";

export interface ConfigurationOutcome {
  type: "success" | "error";
  message: string;
  rolledBack?: boolean;
}

export interface ConfigApplicationConfirmation {
  managementReconnect: boolean;
  warnings: ConfigIssue[];
}
