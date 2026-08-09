import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Token, LoginRequest, User, Scan, Prediction, PredictResponse, ScanListResponse, PredictionListResponse, HealthResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

class ApiService {
  private client: AxiosInstance;
  private refreshTokenPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
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
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401 && !originalRequest._retry) {
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
    if (!refreshToken) {
      throw new Error('No refresh token');
    }

    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
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
  }

  async login(credentials: LoginRequest): Promise<Token> {
    const response = await this.client.post<Token>('/auth/login', credentials);
    const { access_token, refresh_token } = response.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    return response.data;
  }

  async register(userData: Partial<User> & { password: string }): Promise<User> {
    const response = await this.client.post<User>('/auth/register', userData);
    return response.data;
  }

  async getMe(): Promise<User> {
    const response = await this.client.get<User>('/auth/me');
    return response.data;
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
  }

  async flagPrediction(id: number, flagged: boolean): Promise<Prediction> {
    const response = await this.client.post<Prediction>(`/predictions/${id}/flag`, { flagged });
    return response.data;
  }

  /**
   * Fetch a protected image (e.g. scan or heatmap) as a blob so the JWT can
   * be sent via the Authorization header (a plain <img> tag cannot do that).
   * Returns an object URL that must be revoked by the caller.
   */
  async fetchImageBlob(fullUrl: string): Promise<string> {
    const path = fullUrl.replace(/^\/api\/v1/, '');
    const response = await this.client.get<Blob>(path, { responseType: 'blob' });
    return URL.createObjectURL(response.data);
  }

  async getScans(params?: {
    page?: number;
    page_size?: number;
    status?: string;
    patient_id?: string;
  }): Promise<ScanListResponse> {
    const response = await this.client.get<ScanListResponse>('/scans/', { params });
    return response.data;
  }

  async getScan(id: number): Promise<Scan> {
    const response = await this.client.get<Scan>(`/scans/${id}`);
    return response.data;
  }

  async deleteScan(id: number): Promise<void> {
    await this.client.delete(`/scans/${id}`);
  }

  async predict(scanId: number): Promise<PredictResponse> {
    const response = await this.client.post<PredictResponse>(`/predictions/predict/${scanId}`);
    return response.data;
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
    const response = await this.client.get<PredictionListResponse>('/predictions/', { params });
    return response.data;
  }

  async getPrediction(id: number): Promise<Prediction> {
    const response = await this.client.get<Prediction>(`/predictions/${id}`);
    return response.data;
  }

  async getPatientHistory(patientId: string): Promise<Prediction[]> {
    const response = await this.client.get<Prediction[]>(`/predictions/patient/${patientId}/history`);
    return response.data;
  }

  getImageUrl(path: string): string {
    return `${API_BASE_URL}/predictions/image/${path}`;
  }

  async healthCheck(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/health/');
    return response.data;
  }
}

export const api = new ApiService();