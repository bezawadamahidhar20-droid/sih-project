export type UserRole = 'doctor' | 'radiologist' | 'staff';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export type ScanStatus = 'uploaded' | 'processing' | 'completed' | 'failed';

export interface Scan {
  id: number;
  file_hash: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  anonymized_patient_id: string | null;
  study_date: string | null;
  modality: string | null;
  body_part: string | null;
  status: ScanStatus;
  uploaded_by: number;
  created_at: string;
  processed_at: string | null;
  thumbnail_url?: string | null;
}

export interface Prediction {
  id: number;
  scan_id: number;
  predicted_class: string;
  confidence: number;
  all_probabilities: Record<string, number>;
  gradcam_url: string | null;
  processing_time_ms: number | null;
  model_version: string;
  model_architecture: string;
  is_low_confidence: boolean;
  is_high_risk: boolean;
  is_flagged: boolean;
  flagged_by: number | null;
  flagged_at: string | null;
  /** Calibrated decision boundary in effect for this prediction (0.5 = argmax). */
  model_decision_threshold?: number | null;
  scan: Scan | null;
  created_at: string;
}

export interface PredictResponse {
  prediction: Prediction;
  scan: Scan;
  original_image_url: string;
  gradcam_overlay_url: string;
  warning: string | null;
}

export interface ScanListResponse {
  scans: Scan[];
  total: number;
  page: number;
  page_size: number;
}

export interface PredictionListResponse {
  predictions: Prediction[];
  total: number;
  page: number;
  page_size: number;
}

export interface ModelMetrics {
  num_samples?: number | null;
  accuracy?: number | null;
  balanced_accuracy?: number | null;
  sensitivity?: number | null;
  specificity?: number | null;
  precision?: number | null;
  auc?: number | null;
  class_names?: string[];
}

export interface HealthResponse {
  status: string;
  version: string;
  model_loaded: boolean;
  engine: string;
  device: string;
  model_path?: string;
  heuristic_fallback_active?: boolean;
  /** Calibrated decision boundary for the abnormal class (0.5 = argmax). */
  model_decision_threshold?: number | null;
  /** Real hold-out validation metrics from <model>.evaluation.json. */
  model_metrics?: ModelMetrics | null;
}

export interface ApiError {
  detail: string;
  error_code?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export type ImageFile = File & { preview?: string };

export interface HistoryFilters {
  patientId?: string;
  predictedClass?: string;
  minConfidence?: number;
  flagged?: 'all' | 'flagged' | 'unflagged';
  recency?: 'all' | '7' | '30' | '90';
}
