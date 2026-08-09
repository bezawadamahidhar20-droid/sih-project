import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Button,
  Alert,
  LinearProgress,
  Chip,
  IconButton,
  TextField,
} from '@mui/material'
import {
  CloudUploadOutlined,
  DeleteOutlineOutlined,
  CheckCircleOutlineOutlined,
  ErrorOutlineOutlined,
  MedicalInformationOutlined,
  VisibilityOutlined,
} from '@mui/icons-material'
import { useDropzone, FileRejection } from 'react-dropzone'
import { api } from '../services/api'
import { Scan } from '../types'

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.dcm', '.dicom']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

interface FileEntry {
  file: File // the real File object (spreading a File loses its Blob identity)
  id: string
  preview?: string
  status: 'pending' | 'uploading' | 'completed' | 'error'
  progress: number
  error?: string
  scan?: Scan
}

interface UploadZoneProps {
  onUploaded: (scan: Scan) => void
  onError?: (message: string) => void
  defaultPatientId?: string
}

function validateFile(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File type "${ext || '(none)'}" not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File too large. Maximum size is 50MB.'
  }
  return null
}

export function UploadZone({ onUploaded, onError, defaultPatientId = '' }: UploadZoneProps) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [patientId, setPatientId] = useState(defaultPatientId)
  const [uploading, setUploading] = useState(false)
  const [globalError, setGlobalError] = useState('')

  const onDrop = useCallback((accepted: File[], rejected: FileRejection[]) => {
    const entries: FileEntry[] = accepted.map((file) => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      preview: URL.createObjectURL(file),
      status: 'pending' as const,
      progress: 0,
    }))

    if (rejected.length > 0) {
      const reasons = rejected.flatMap((r) => r.errors.map((e) => e.message)).join(' ')
      setGlobalError(`Some files were rejected: ${reasons}`)
    }

    if (entries.length > 0) {
      setFiles((prev) => [...prev, ...entries])
      setGlobalError('')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
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
    noClick: true,
    noKeyboard: true,
  })

  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target?.preview) URL.revokeObjectURL(target.preview)
      return prev.filter((f) => f.id !== id)
    })
  }

  const uploadOne = async (file: FileEntry) => {
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, status: 'uploading', progress: 0 } : f)))

    const validationError = validateFile(file.file)
    if (validationError) {
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, status: 'error', error: validationError } : f)))
      onError?.(validationError)
      return
    }

    try {
      const scan = await api.uploadScan(
        file.file,
        patientId.trim() || undefined,
        (progress) => {
          setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, progress: progress.percentage } : f)))
        }
      )
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, status: 'completed', progress: 100, scan } : f)))
      onUploaded(scan)
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || 'Upload failed'
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, status: 'error', error: message } : f)))
      onError?.(message)
    }
  }

  const handleUploadAll = async () => {
    const pending = files.filter((f) => f.status === 'pending')
    if (pending.length === 0) return
    setUploading(true)
    setGlobalError('')
    try {
      for (const file of pending) {
        await uploadOne(file)
      }
    } finally {
      setUploading(false)
    }
  }

  const clearCompleted = () => {
    setFiles((prev) => {
      prev.filter((f) => f.status === 'completed').forEach((f) => f.preview && URL.revokeObjectURL(f.preview))
      return prev.filter((f) => f.status !== 'completed')
    })
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const completedCount = files.filter((f) => f.status === 'completed').length

  return (
    <Box>
      <Box
        {...getRootProps()}
        onClick={open}
        role="button"
        aria-label="Upload medical scan files"
        sx={{
          border: '1.5px dashed',
          borderColor: isDragActive ? '#12507E' : isDragReject ? '#B3261E' : '#C6CED6',
          borderRadius: 1,
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragActive ? '#EAF2FA' : 'transparent',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
          '&:hover': { borderColor: '#12507E', backgroundColor: '#F7F9FB' },
        }}
      >
        <input {...getInputProps()} />
        <CloudUploadOutlined sx={{ fontSize: 44, color: isDragActive ? '#12507E' : '#8FA3B5', mb: 1.5 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {isDragActive ? 'Drop scans here' : 'Drag & drop scans here, or click to browse'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          JPEG, PNG, DICOM (.dcm) · max 50MB per file
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {files.length} file(s) selected
        </Typography>
      </Box>

      <Box sx={{ mt: 2.5 }}>
        <TextField
          label="Anonymized patient ID (optional)"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          fullWidth
          size="small"
          placeholder="e.g. PAT-2026-0001"
          helperText="Used to group scans per patient for history views. PHI (real patient identity) is never stored."
        />
      </Box>

      {globalError && (
        <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setGlobalError('')}>
          {globalError}
        </Alert>
      )}

      {files.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Selected files ({files.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<CloudUploadOutlined />}
                onClick={handleUploadAll}
                disabled={uploading || pendingCount === 0}
              >
                {uploading ? 'Uploading…' : `Upload${pendingCount ? ` (${pendingCount})` : ''}`}
              </Button>
              {completedCount > 0 && (
                <Button size="small" color="inherit" onClick={clearCompleted}>
                  Clear completed
                </Button>
              )}
            </Box>
          </Box>

          <Box sx={{ maxHeight: 380, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {files.map((file) => (
              <Box
                key={file.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.25,
                  border: 1,
                  borderColor: file.status === 'error' ? '#E5B8B5' : '#DCE1E7',
                  borderRadius: 1,
                  backgroundColor: file.status === 'error' ? '#FDF4F3' : 'background.paper',
                }}
              >
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: 0.5,
                    overflow: 'hidden',
                    flexShrink: 0,
                    backgroundColor: '#F0F3F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {file.preview ? (
                    <img src={file.preview} alt={file.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <MedicalInformationOutlined sx={{ color: '#8FA3B5' }} />
                  )}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                    {file.file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(file.file.size / 1024 / 1024).toFixed(2)} MB
                  </Typography>

                  {file.status === 'uploading' && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <LinearProgress variant="determinate" value={file.progress} sx={{ flex: 1, height: 4 }} />
                      <Typography variant="caption" color="text.secondary">
                        {file.progress}%
                      </Typography>
                    </Box>
                  )}

                  {file.status === 'completed' && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <Chip
                        icon={<CheckCircleOutlineOutlined />}
                        label="Uploaded"
                        size="small"
                        variant="outlined"
                        color="success"
                      />
                      {file.scan && (
                        <Button
                          size="small"
                          startIcon={<VisibilityOutlined />}
                          onClick={() => onUploaded(file.scan!)}
                        >
                          Review
                        </Button>
                      )}
                    </Box>
                  )}

                  {file.status === 'error' && (
                    <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#B3261E', mt: 0.5 }}>
                      <ErrorOutlineOutlined fontSize="inherit" />
                      {file.error}
                    </Typography>
                  )}
                </Box>

                <IconButton
                  size="small"
                  onClick={() => removeFile(file.id)}
                  disabled={file.status === 'uploading'}
                  aria-label={`Remove ${file.file.name}`}
                >
                  <DeleteOutlineOutlined fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}
