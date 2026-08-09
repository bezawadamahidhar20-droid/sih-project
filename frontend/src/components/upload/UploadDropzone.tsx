import { useCallback, useEffect, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import {
  Box,
  Typography,
  Stack,
  Chip,
  IconButton,
  LinearProgress,
  Button,
  TextField,
  Alert,
  Paper,
} from '@mui/material';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { api } from '../../services/api';
import { Scan } from '../../types';

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

interface UploadDropzoneProps {
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDropzone({ onUploaded, onError, defaultPatientId = '' }: UploadDropzoneProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [patientId, setPatientId] = useState(defaultPatientId);
  const [uploading, setUploading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const onDrop = useCallback((accepted: File[], rejected: FileRejection[]) => {
    const entries: FileEntry[] = accepted.map((file) => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'pending' as const,
      progress: 0,
    }));
    if (rejected.length > 0) {
      const reasons = rejected.flatMap((r) => r.errors.map((e) => e.message)).join(' ');
      setGlobalError(`Some files were rejected: ${reasons}`);
    }
    if (entries.length > 0) {
      setFiles((prev) => [...prev, ...entries]);
      setGlobalError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/dicom': ['.dcm', '.dicom'],
      'application/octet-stream': ['.dcm', '.dicom'],
    },
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  useEffect(() => {
    return () => {
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
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
    setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, status: 'uploading', progress: 0 } : f)));
    const validationError = validateFile(entry.file);
    if (validationError) {
      setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, status: 'error', error: validationError } : f)));
      onError?.(validationError);
      return;
    }
    try {
      const scan = await api.uploadScan(entry.file, patientId.trim() || undefined, (progress) => {
        setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, progress: progress.percentage } : f)));
      });
      setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, status: 'completed', progress: 100, scan } : f)));
      onUploaded(scan);
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || 'Upload failed.';
      setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, status: 'error', error: message } : f)));
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
      prev.filter((f) => f.status === 'completed').forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      return prev.filter((f) => f.status !== 'completed');
    });
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const completedCount = files.filter((f) => f.status === 'completed').length;

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Anonymized Patient ID <Typography component="span" variant="caption" color="text.secondary">(optional)</Typography>
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="e.g. PAT-2026-0001"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
        />
        <Typography variant="caption" color="text.secondary">
          Used to group scans per patient. Real patient identity (PHI) is never stored.
        </Typography>
      </Box>

      <Paper
        {...getRootProps()}
        variant="outlined"
        sx={{
          p: 5,
          borderRadius: 3,
          borderStyle: 'dashed',
          borderWidth: 2,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all .2s',
          bgcolor: isDragReject ? 'error.light' : isDragActive ? 'info.light' : 'grey.50',
          borderColor: isDragReject ? 'error.main' : isDragActive ? 'primary.main' : 'divider',
          '&:hover': { borderColor: 'primary.main', bgcolor: 'info.light' },
        }}
      >
        <input {...getInputProps()} />
        <Box
          sx={{
            width: 64,
            height: 64,
            mx: 'auto',
            mb: 2,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: isDragActive ? 'primary.light' : 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <CloudUploadRoundedIcon sx={{ fontSize: 32, color: isDragActive ? 'primary.main' : 'grey.500' }} />
        </Box>
        <Typography variant="subtitle1">
          {isDragActive ? 'Drop medical images here' : 'Drag & drop medical images here'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          or{' '}
          <Typography component="span" color="primary.main" sx={{ fontWeight: 600 }}>
            browse files
          </Typography>
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 2.5, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['JPEG', 'PNG', 'DICOM'].map((fmt) => (
            <Chip key={fmt} size="small" label={fmt} variant="outlined" sx={{ fontFamily: 'monospace' }} />
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            · Max 50 MB
          </Typography>
        </Stack>
      </Paper>

      {globalError && (
        <Alert severity="error" icon={<ErrorRoundedIcon fontSize="small" />} onClose={() => setGlobalError('')}>
          {globalError}
        </Alert>
      )}

      {files.length > 0 && (
        <Stack spacing={1.5}>
          {files.map((entry) => (
            <Paper
              key={entry.id}
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                borderColor: entry.status === 'error' ? 'error.main' : entry.status === 'completed' ? 'success.main' : 'divider',
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  flexShrink: 0,
                  bgcolor: 'grey.100',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {entry.preview ? (
                  <Box component="img" src={entry.preview} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <InsertDriveFileRoundedIcon sx={{ color: 'grey.400' }} />
                )}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {entry.file.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatBytes(entry.file.size)}
                </Typography>
                {(entry.status === 'uploading' || entry.status === 'completed') && (
                  <LinearProgress
                    variant="determinate"
                    value={entry.progress}
                    sx={{
                      mt: 0.75,
                      '& .MuiLinearProgress-bar': { bgcolor: entry.status === 'completed' ? 'success.main' : 'primary.main' },
                    }}
                  />
                )}
                {entry.status === 'error' && (
                  <Typography variant="caption" color="error.main">
                    {entry.error}
                  </Typography>
                )}
              </Box>
              <Box sx={{ flexShrink: 0 }}>
                {entry.status === 'completed' && <CheckCircleRoundedIcon color="success" fontSize="small" />}
                {entry.status === 'error' && <ErrorRoundedIcon color="error" fontSize="small" />}
                {entry.status === 'pending' && (
                  <IconButton size="small" onClick={() => removeFile(entry.id)}>
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </Paper>
          ))}

          <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
            {completedCount > 0 && (
              <Button size="small" onClick={clearCompleted} startIcon={<VisibilityRoundedIcon />}>
                Clear completed
              </Button>
            )}
            {pendingCount > 0 && (
              <Button variant="contained" onClick={handleUploadAll} disabled={uploading}>
                {uploading ? 'Uploading…' : `Upload ${pendingCount} file${pendingCount > 1 ? 's' : ''}`}
              </Button>
            )}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
