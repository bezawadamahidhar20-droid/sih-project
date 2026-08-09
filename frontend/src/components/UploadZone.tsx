import { useCallback, useEffect, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import {
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  ScanLine,
  Eye,
} from 'lucide-react';
import { api } from '../services/api';
import { Scan } from '../types';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.dcm', '.dicom'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface FileEntry {
  file: File;
  id: string;
  preview?: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
  scan?: Scan;
}

interface UploadZoneProps {
  onUploaded: (scan: Scan) => void;
  onError?: (message: string) => void;
  defaultPatientId?: string;
}

function validateFile(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File type "${ext || '(none)'}" not supported. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File too large. Maximum size is 50 MB.';
  }
  return null;
}

export function UploadZone({
  onUploaded,
  onError,
  defaultPatientId = '',
}: UploadZoneProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [patientId, setPatientId] = useState(defaultPatientId);
  const [uploading, setUploading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      const entries: FileEntry[] = accepted.map((file) => ({
        file,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        status: 'pending' as const,
        progress: 0,
      }));
      if (rejected.length > 0) {
        const reasons = rejected
          .flatMap((r) => r.errors.map((e) => e.message))
          .join(' ');
        setGlobalError(`Some files were rejected: ${reasons}`);
      }
      if (entries.length > 0) {
        setFiles((prev) => [...prev, ...entries]);
        setGlobalError('');
      }
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: {
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'application/dicom': ['.dcm', '.dicom'],
        'image/dicom': ['.dcm', '.dicom'],
        'application/octet-stream': ['.dcm', '.dicom'],
      },
      maxSize: MAX_FILE_SIZE,
      multiple: true,
      noClick: false,
    });

  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const uploadOne = async (entry: FileEntry) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === entry.id ? { ...f, status: 'uploading', progress: 0 } : f
      )
    );
    const validationError = validateFile(entry.file);
    if (validationError) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id ? { ...f, status: 'error', error: validationError } : f
        )
      );
      onError?.(validationError);
      return;
    }
    try {
      const scan = await api.uploadScan(
        entry.file,
        patientId.trim() || undefined,
        (progress) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id
                ? { ...f, progress: progress.percentage }
                : f
            )
          );
        }
      );
      setFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id
            ? { ...f, status: 'completed', progress: 100, scan }
            : f
        )
      );
      onUploaded(scan);
    } catch (err: any) {
      const message =
        err.response?.data?.detail || err.message || 'Upload failed.';
      setFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id ? { ...f, status: 'error', error: message } : f
        )
      );
      onError?.(message);
    }
  };

  const handleUploadAll = async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;
    setUploading(true);
    setGlobalError('');
    try {
      for (const file of pending) {
        await uploadOne(file);
      }
    } finally {
      setUploading(false);
    }
  };

  const clearCompleted = () => {
    setFiles((prev) => {
      prev
        .filter((f) => f.status === 'completed')
        .forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      return prev.filter((f) => f.status !== 'completed');
    });
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const completedCount = files.filter((f) => f.status === 'completed').length;

  return (
    <div className="space-y-5">
      {/* Patient ID */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
          Anonymized Patient ID
          <span className="text-slate-400 font-normal ml-1">(optional)</span>
        </label>
        <input
          type="text"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          placeholder="e.g. PAT-2026-0001"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
        />
        <p className="text-xs text-slate-400">
          Used to group scans per patient. Real patient identity (PHI) is never stored.
        </p>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`relative flex flex-col items-center justify-center gap-4 p-10 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
          isDragReject
            ? 'border-red-400 bg-red-50'
            : isDragActive
            ? 'border-blue-400 bg-blue-50 scale-[1.01]'
            : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50'
        }`}
        aria-label="Upload medical scan files"
      >
        <input {...getInputProps()} aria-label="File input" />
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
            isDragActive ? 'bg-blue-100' : 'bg-white border border-slate-200'
          }`}
        >
          <Upload
            className={`w-7 h-7 transition-colors ${
              isDragActive ? 'text-blue-600' : 'text-slate-400'
            }`}
          />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-700">
            {isDragActive
              ? 'Drop medical images here'
              : 'Drag & drop medical images here'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            or{' '}
            <span className="text-blue-600 font-medium">browse files</span>
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          {['JPEG', 'PNG', 'DICOM'].map((fmt) => (
            <span
              key={fmt}
              className="px-2 py-1 rounded bg-white border border-slate-200 font-mono"
            >
              {fmt}
            </span>
          ))}
          <span>· Max 50 MB</span>
        </div>
      </div>

      {globalError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{globalError}</p>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              Selected files ({files.length})
            </p>
            <div className="flex items-center gap-2">
              {completedCount > 0 && (
                <button
                  onClick={clearCompleted}
                  className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Clear completed
                </button>
              )}
              <button
                onClick={handleUploadAll}
                disabled={uploading || pendingCount === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Upload className="w-4 h-4" />
                {uploading
                  ? 'Uploading…'
                  : `Upload${pendingCount ? ` (${pendingCount})` : ''}`}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white"
              >
                {/* Preview or icon */}
                {f.preview ? (
                  <img
                    src={f.preview}
                    alt={f.file.name}
                    className="w-10 h-10 rounded-md object-cover flex-shrink-0 border border-slate-100"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <ScanLine className="w-5 h-5 text-slate-400" />
                  </div>
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {f.file.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {(f.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>

                  {f.status === 'uploading' && (
                    <div className="mt-1.5">
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {f.progress}%
                      </p>
                    </div>
                  )}

                  {f.status === 'error' && (
                    <p className="text-xs text-red-600 mt-0.5">{f.error}</p>
                  )}
                </div>

                {/* Status + actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {f.status === 'completed' && (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      {f.scan && (
                        <button
                          onClick={() => onUploaded(f.scan!)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-all"
                          title="Analyze this scan"
                        >
                          <Eye className="w-3 h-3" />
                          Analyze
                        </button>
                      )}
                    </>
                  )}
                  {f.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                  {f.status !== 'uploading' && (
                    <button
                      onClick={() => removeFile(f.id)}
                      className="p-1 text-slate-300 hover:text-slate-500 transition-colors rounded"
                      aria-label={`Remove ${f.file.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
