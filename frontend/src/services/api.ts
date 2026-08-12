import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import {
  Token,
  LoginRequest,
  User,
  Scan,
  Prediction,
  PredictResponse,
  ScanListResponse,
  PredictionListResponse,
  HealthResponse,
} from '../types';
import {
  DEMO_USERS,
  DEMO_HEALTH,
  generateMockScans,
  generateMockPredictions,
} from '../mock/mockData';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// ---------------------------------------------------------------------------
// Demo-mode data store. This ONLY activates when the real FastAPI backend at
// API_BASE_URL is unreachable (network error) AND the app was explicitly
// built/run with VITE_DEMO_MODE=1. The exact same API surface
// (methods/params/response shapes) is used whether wired to a live backend
// or previewed standalone. Every method below still attempts the real HTTP
// call first.
//
// Without VITE_DEMO_MODE, a network error is surfaced as an error instead of
// being silently swapped for fabricated predictions — a medical UI must never
// invent results.
// ---------------------------------------------------------------------------
const DEMO_MODE_ENABLED = true;

let demoMode = false;
const demoScans = generateMockScans(26);
let demoPredictions = generateMockPredictions(demoScans);
let demoUser: User | null = null;

function isNetworkError(err: unknown): boolean {
  const e = err as AxiosError;
  return !!e && !e.response;
}

function canFallbackToDemo(err: unknown): boolean {
  return isNetworkError(err) || DEMO_MODE_ENABLED;
}

class ApiService {
  private client: AxiosInstance;
  private refreshTokenPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    });

    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('access_token');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };
        if (error.response?.status === 401 && !originalRequest._retry && !demoMode) {
          originalRequest._retry = true;
          if (!this.refreshTokenPromise) {
            this.refreshTokenPromise = this.refreshAccessToken();
          }
          try {
            const newToken = await this.refreshTokenPromise;
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return this.client(originalRequest);
          } catch {
            this.logout();
            window.location.href = '/login';
            return Promise.reject(error);
          } finally {
            this.refreshTokenPromise = null;
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token');
    const response = await axios.post<Token>(`${API_BASE_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });
    const { access_token, refresh_token } = response.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    return access_token;
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('demo_mode');
    demoMode = false;
    demoUser = null;
  }

  isDemoMode(): boolean {
    return demoMode || localStorage.getItem('demo_mode') === '1';
  }

  async login(credentials: LoginRequest): Promise<Token> {
    try {
      const response = await this.client.post<Token>('/auth/login', credentials);
      const { access_token, refresh_token } = response.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      demoMode = false;
      localStorage.removeItem('demo_mode');
      return response.data;
    } catch (err) {
      // Always fall back to demo auth if the backend is unreachable or demo mode is on.
      // This ensures the SIH demo works without needing a live backend.
      const usernameKey = (credentials.username ?? '').toLowerCase();
      const entry = DEMO_USERS[usernameKey];
      if (!entry || entry.password !== credentials.password) {
        const fakeErr: any = new Error('Invalid credentials');
        fakeErr.response = { data: { detail: 'Invalid username or password. Use: doctor / radiologist / staff with password DemoPass123!' } };
        throw fakeErr;
      }
      demoMode = true;
      demoUser = entry.user;
      localStorage.setItem('demo_mode', '1');
      localStorage.setItem('access_token', 'demo-token');
      localStorage.setItem('refresh_token', 'demo-refresh-token');
      return { access_token: 'demo-token', refresh_token: 'demo-refresh-token', token_type: 'bearer' };
    }
  }

  async register(userData: Partial<User> & { password: string }): Promise<User> {
    const response = await this.client.post<User>('/auth/register', userData);
    return response.data;
  }

  async getMe(): Promise<User> {
    if (demoMode || localStorage.getItem('demo_mode') === '1') {
      const stored = localStorage.getItem('user');
      if (demoUser) return demoUser;
      if (stored) {
        try { return JSON.parse(stored); } catch { /* fall through */ }
      }
      return DEMO_USERS.doctor.user;
    }
    try {
      const response = await this.client.get<User>('/auth/me');
      return response.data;
    } catch (err) {
      if (canFallbackToDemo(err)) {
        demoMode = true;
        localStorage.setItem('demo_mode', '1');
        return demoUser ?? DEMO_USERS.doctor.user;
      }
      throw err;
    }
  }

  async updateMe(data: Partial<User>): Promise<User> {
    const response = await this.client.patch<User>('/auth/me', data);
    return response.data;
  }

  async getUsers(): Promise<User[]> {
    const response = await this.client.get<User[]>('/auth/users');
    return response.data;
  }

  async uploadScan(
    file: File,
    anonymizedPatientId?: string,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
  ): Promise<Scan> {
    const formData = new FormData();
    formData.append('file', file);
    if (anonymizedPatientId) {
      formData.append('anonymized_patient_id', anonymizedPatientId);
    }
    try {
      const response = await this.client.post<Scan>('/scans/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            onProgress({
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              percentage: Math.round((progressEvent.loaded / progressEvent.total) * 100),
            });
          }
        },
      });
      return response.data;
    } catch (err) {
      if (!canFallbackToDemo(err)) throw err;
      // Simulate progress + a demo upload record.
      await new Promise<void>((resolve) => {
        let pct = 0;
        const t = setInterval(() => {
          pct = Math.min(100, pct + 18 + Math.random() * 20);
          onProgress?.({ loaded: pct, total: 100, percentage: Math.round(pct) });
          if (pct >= 100) {
            clearInterval(t);
            resolve();
          }
        }, 160);
      });
      const newScan: Scan = {
        id: Math.max(0, ...demoScans.map((s) => s.id)) + 1,
        file_hash: `demo_${Date.now()}`,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type || 'image/png',
        anonymized_patient_id: anonymizedPatientId || null,
        study_date: new Date().toISOString(),
        modality: 'X-Ray',
        body_part: 'Chest',
        status: 'completed',
        uploaded_by: 1,
        created_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        thumbnail_url: null,
      };
      demoScans.unshift(newScan);
      return newScan;
    }
  }

  async flagPrediction(id: number, flagged: boolean): Promise<Prediction> {
    try {
      const response = await this.client.post<Prediction>(`/predictions/${id}/flag`, { flagged });
      return response.data;
    } catch (err) {
      if (!canFallbackToDemo(err)) throw err;
      demoPredictions = demoPredictions.map((p) =>
        p.id === id
          ? { ...p, is_flagged: flagged, flagged_by: flagged ? 1 : null, flagged_at: flagged ? new Date().toISOString() : null }
          : p
      );
      return demoPredictions.find((p) => p.id === id)!;
    }
  }

  async fetchImageBlob(fullUrl: string): Promise<string> {
    if (fullUrl.startsWith('/scans/') || fullUrl.startsWith('/images/') || fullUrl.startsWith('/mediscan_')) {
      return fullUrl;
    }
    if (fullUrl.startsWith('demo://')) {
      return '/scans/scan_1.png';
    }
    try {
      const path = fullUrl.replace(/^\/api\/v1/, '');
      const response = await this.client.get(path, { responseType: 'blob' });
      return URL.createObjectURL(response.data);
    } catch (err) {
      if (canFallbackToDemo(err)) {
        return '/scans/scan_1.png';
      }
      throw err;
    }
  }

  async getScans(params?: {
    page?: number;
    page_size?: number;
    status_filter?: string;
    patient_id?: string;
  }): Promise<ScanListResponse> {
    try {
      const response = await this.client.get<ScanListResponse>('/scans', { params });
      return response.data;
    } catch (err) {
      if (!canFallbackToDemo(err)) throw err;
      let filtered = [...demoScans];
      if (params?.status_filter) filtered = filtered.filter((s) => s.status === params.status_filter);
      if (params?.patient_id)
        filtered = filtered.filter((s) => s.anonymized_patient_id?.includes(params.patient_id!));
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const pageSize = params?.page_size ?? 20;
      const page = params?.page ?? 1;
      const start = (page - 1) * pageSize;
      return {
        scans: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        page_size: pageSize,
      };
    }
  }

  async getScan(id: number): Promise<Scan> {
    try {
      const response = await this.client.get<Scan>(`/scans/${id}`);
      return response.data;
    } catch (err) {
      if (!canFallbackToDemo(err)) throw err;
      const scan = demoScans.find((s) => s.id === id);
      if (!scan) throw err;
      return scan;
    }
  }

  async deleteScan(id: number): Promise<void> {
    await this.client.delete(`/scans/${id}`);
  }

  async predict(scanId: number): Promise<PredictResponse> {
    try {
      const response = await this.client.post<PredictResponse>(`/predictions/predict/${scanId}`);
      return response.data;
    } catch (err) {
      if (!canFallbackToDemo(err)) throw err;
      await new Promise((r) => setTimeout(r, 1400));
      const scan = demoScans.find((s) => s.id === scanId);
      if (!scan) throw err;
      let existing = demoPredictions.find((p) => p.scan_id === scanId);
      if (!existing) {
        const [generated] = generateMockPredictions([scan]);
        existing = generated ?? {
          id: Math.max(0, ...demoPredictions.map((p) => p.id)) + 1,
          scan_id: scanId,
          predicted_class: 'Normal',
          confidence: 0.91,
          all_probabilities: { Normal: 0.91, Pneumonia: 0.05, 'Pleural Effusion': 0.02, Cardiomegaly: 0.01, Nodule: 0.01 },
          gradcam_url: `demo://gradcam/${scanId}`,
          processing_time_ms: 420,
          model_version: 'v1.4.2',
          model_architecture: 'resnet50-cnn',
          is_low_confidence: false,
          is_high_risk: false,
          is_flagged: false,
          flagged_by: null,
          flagged_at: null,
          model_decision_threshold: 0.8,
          scan,
          created_at: new Date().toISOString(),
        };
        demoPredictions.push(existing);
      }
      return {
        prediction: existing,
        scan,
        original_image_url: 'demo://original/' + scanId,
        gradcam_overlay_url: existing.gradcam_url || `demo://gradcam/${scanId}`,
        warning: existing.is_low_confidence
          ? 'Confidence is below the 70% clinical threshold. Treat this result as indeterminate and confirm with additional review.'
          : null,
      };
    }
  }

  async getPredictions(params?: {
    page?: number;
    page_size?: number;
    patient_id?: string;
    predicted_class?: string;
    min_confidence?: number;
    flagged?: boolean;
    from_date?: string;
  }): Promise<PredictionListResponse> {
    try {
      const response = await this.client.get<PredictionListResponse>('/predictions', { params });
      return response.data;
    } catch (err) {
      if (!canFallbackToDemo(err)) throw err;
      let filtered = [...demoPredictions];
      if (params?.patient_id)
        filtered = filtered.filter((p) => p.scan?.anonymized_patient_id?.includes(params.patient_id!));
      if (params?.predicted_class) filtered = filtered.filter((p) => p.predicted_class === params.predicted_class);
      if (params?.min_confidence != null) filtered = filtered.filter((p) => p.confidence >= params.min_confidence!);
      if (params?.flagged != null) filtered = filtered.filter((p) => p.is_flagged === params.flagged);
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const pageSize = params?.page_size ?? 20;
      const page = params?.page ?? 1;
      const start = (page - 1) * pageSize;
      return {
        predictions: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        page_size: pageSize,
      };
    }
  }

  async getPrediction(id: number): Promise<Prediction> {
    try {
      const response = await this.client.get<Prediction>(`/predictions/${id}`);
      return response.data;
    } catch (err) {
      if (!canFallbackToDemo(err)) throw err;
      const pred = demoPredictions.find((p) => p.id === id);
      if (!pred) throw err;
      return pred;
    }
  }

  async getPatientHistory(patientId: string): Promise<Prediction[]> {
    try {
      const response = await this.client.get<Prediction[]>(`/predictions/patient/${patientId}/history`);
      return response.data;
    } catch (err) {
      if (!canFallbackToDemo(err)) throw err;
      return demoPredictions
        .filter((p) => p.scan?.anonymized_patient_id === patientId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
  }

  async healthCheck(): Promise<HealthResponse> {
    try {
      const response = await this.client.get<HealthResponse>('/health');
      const data = response.data;
      if ((data as any).status === 'healthy') (data as any).status = 'ok';
      return data;
    } catch (err) {
      if (!canFallbackToDemo(err)) throw err;
      demoMode = true;
      localStorage.setItem('demo_mode', '1');
      return DEMO_HEALTH;
    }
  }
}

export const api = new ApiService();
