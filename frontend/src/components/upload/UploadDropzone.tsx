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
  Grid,
} from '@mui/material';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { api } from '../../services/api';
import { Scan } from '../../types';
import { tokens } from '../../theme';

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
        elevation={0}
        sx={{
          p: 5,
          borderRadius: 4,
          borderStyle: 'dashed',
          borderWidth: 2,
          textAlign: 'center',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          bgcolor: isDragReject
            ? 'rgba(192, 54, 44, 0.08)'
            : isDragActive
            ? 'rgba(15, 92, 140, 0.12)'
            : 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(16px)',
          borderColor: isDragReject
            ? 'error.main'
            : isDragActive
            ? 'primary.main'
            : 'rgba(15, 92, 140, 0.25)',
          transform: isDragActive ? 'scale(1.02)' : 'none',
          boxShadow: isDragActive
            ? '0 12px 32px rgba(15, 92, 140, 0.22), 0 0 20px rgba(61,128,168,0.2)'
            : '0 4px 16px rgba(15, 36, 48, 0.04)',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'rgba(15, 92, 140, 0.06)',
            transform: 'translateY(-2px)',
          },
        }}
      >
        {/* Holographic Laser Scanning Line */}
        <Box className="laser-scanner-line" />
        <input {...getInputProps()} />
        <Box
          sx={{
            width: 72,
            height: 72,
            mx: 'auto',
            mb: 2,
            borderRadius: 3.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: isDragActive ? 'primary.main' : 'rgba(15, 92, 140, 0.08)',
            border: '1px solid',
            borderColor: isDragActive ? 'primary.main' : 'rgba(15, 92, 140, 0.2)',
            boxShadow: isDragActive ? '0 8px 24px rgba(15,92,140,0.35)' : 'none',
            transition: 'all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            transform: isDragActive ? 'translateY(-4px) scale(1.1)' : 'none',
          }}
        >
          <CloudUploadRoundedIcon sx={{ fontSize: 36, color: isDragActive ? '#fff' : 'primary.main' }} />
        </Box>
        <Typography variant="subtitle1" sx={{ fontFamily: 'Figtree, sans-serif' }}>
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

      {/* 1-Click Sample Scan Quick Selector for Hackathon Reviewers */}
      <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(0, 180, 216, 0.06)', border: '1px solid rgba(0, 180, 216, 0.2)' }}>
        <Typography variant="caption" sx={{ color: tokens.cyan, fontWeight: 700, mb: 1, display: 'block' }}>
          HACKATHON JUDGE DEMO — QUICK SAMPLE SCANS:
        </Typography>
        <Grid container spacing={1}>
          {[
            { idx: 1, label: 'Normal Chest X-Ray', patientId: 'PAT-2026-0001' },
            { idx: 2, label: 'Pneumonia Consolidation', patientId: 'PAT-2026-0002' },
            { idx: 3, label: 'Thoracic Axial CT Scan', patientId: 'PAT-2026-0003' },
            { idx: 4, label: 'Cardiomegaly X-Ray', patientId: 'PAT-2026-0004' },
          ].map((sample) => (
            <Grid key={sample.idx} size={{ xs: 6, sm: 3 }}>
              <Button
                fullWidth
                size="small"
                variant="outlined"
                onClick={async () => {
                  setPatientId(sample.patientId);
                  try {
                    const res = await fetch(`/scans/scan_${sample.idx}.png`);
                    const blob = await res.blob();
                    const file = new File([blob], `clinical_scan_${sample.patientId}.png`, { type: 'image/png' });
                    const entry: FileEntry = {
                      file,
                      id: `${Date.now()}-sample-${sample.idx}`,
                      preview: `/scans/scan_${sample.idx}.png`,
                      status: 'pending',
                      progress: 0,
                    };
                    setFiles((prev) => [...prev, entry]);
                  } catch (e) {
                    setGlobalError('Could not load sample scan');
                  }
                }}
                sx={{
                  py: 1,
                  fontSize: '0.72rem',
                  borderColor: 'rgba(0, 180, 216, 0.3)',
                  color: tokens.textPrimary,
                  '&:hover': { borderColor: tokens.cyan, bgcolor: 'rgba(0, 180, 216, 0.12)' },
                }}
              >
                {sample.label}
              </Button>
            </Grid>
          ))}
        </Grid>
      </Box>

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
