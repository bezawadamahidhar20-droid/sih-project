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

export interface HealthResponse {
  status: string;
  version: string;
  model_loaded: boolean;
  engine: string;
  device: string;
  model_path?: string;
  heuristic_fallback_active?: boolean;
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
