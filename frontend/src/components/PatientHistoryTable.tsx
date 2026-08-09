import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  Chip,
  TextField,
  MenuItem,
  InputAdornment,
  Skeleton,
} from '@mui/material'
import {
  SearchOutlined,
  FlagOutlined,
  WarningAmberOutlined,
  MedicalInformationOutlined,
  CheckCircleOutlineOutlined,
} from '@mui/icons-material'
import { Prediction } from '../types'

export interface HistoryFilters {
  patientId?: string
  predictedClass?: string
  minConfidence?: number
  flagged?: 'all' | 'flagged' | 'unflagged'
  recency?: 'all' | '7' | '30' | '90'
}

export interface PatientHistoryTableProps {
  predictions: Prediction[]
  loading?: boolean
  total: number
  page: number
  pageSize: number
  filters: HistoryFilters
  availableClasses?: string[]
  onFiltersChange: (filters: HistoryFilters) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onViewResult: (scanId: number) => void
  onOpenPatient?: (patientId: string) => void
}

function FindingChip({ prediction }: { prediction: Prediction }) {
  const isAbnormal = prediction.predicted_class !== 'Normal'
  return (
    <Chip
      icon={isAbnormal ? <MedicalInformationOutlined /> : <CheckCircleOutlineOutlined />}
      label={prediction.predicted_class}
      size="small"
      variant="outlined"
      sx={{
        color: isAbnormal ? '#B3261E' : '#1E7B45',
        borderColor: isAbnormal ? '#E5B8B5' : '#B7D9C3',
        fontWeight: 600,
      }}
    />
  )
}

export function PatientHistoryTable({
  predictions,
  loading = false,
  total,
  page,
  pageSize,
  filters,
  availableClasses = [],
  onFiltersChange,
  onPageChange,
  onPageSizeChange,
  onViewResult,
  onOpenPatient,
}: PatientHistoryTableProps) {
  const updateFilter = (patch: Partial<HistoryFilters>) => {
    onFiltersChange({ ...filters, ...patch })
  }

  const confidenceOptions = [
    { value: '', label: 'Any confidence' },
    { value: '0.9', label: 'High (≥90%)' },
    { value: '0.7', label: 'Moderate+ (≥70%)' },
    { value: '0.5', label: 'All ≥50%' },
  ]

  const recencyOptions = [
    { value: 'all', label: 'Any time' },
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
  ]

  const flagOptions = [
    { value: 'all', label: 'Any flag status' },
    { value: 'flagged', label: 'Flagged for review' },
    { value: 'unflagged', label: 'Not flagged' },
  ]

  return (
    <Box>
      {/* Filter row */}
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          flexWrap: 'wrap',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <TextField
          label="Patient ID"
          size="small"
          value={filters.patientId ?? ''}
          onChange={(e) => updateFilter({ patientId: e.target.value || undefined })}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 180 }}
        />
        <TextField
          select
          label="Finding"
          size="small"
          value={filters.predictedClass ?? ''}
          onChange={(e) => updateFilter({ predictedClass: e.target.value || undefined })}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All findings</MenuItem>
          {availableClasses.map((c) => (
            <MenuItem key={c} value={c}>{c}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Confidence"
          size="small"
          value={String(filters.minConfidence ?? '')}
          onChange={(e) => updateFilter({ minConfidence: e.target.value === '' ? undefined : Number(e.target.value) })}
          sx={{ minWidth: 160 }}
        >
          {confidenceOptions.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Recency"
          size="small"
          value={filters.recency ?? 'all'}
          onChange={(e) => updateFilter({ recency: e.target.value as HistoryFilters['recency'] })}
          sx={{ minWidth: 150 }}
        >
          {recencyOptions.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Flag status"
          size="small"
          value={filters.flagged ?? 'all'}
          onChange={(e) => updateFilter({ flagged: e.target.value as HistoryFilters['flagged'] })}
          sx={{ minWidth: 170 }}
        >
          {flagOptions.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
      </Box>

      <TableContainer sx={{ border: 1, borderColor: '#DCE1E7', borderRadius: 1 }}>
        <Table size="medium" aria-label="Patient history table">
          <TableHead>
            <TableRow>
              <TableCell sortDirection="desc">Date</TableCell>
              <TableCell>Patient ID</TableCell>
              <TableCell>Scan</TableCell>
              <TableCell>Finding</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  <TableCell colSpan={7}><Skeleton height={28} /></TableCell>
                </TableRow>
              ))
            )}

            {!loading && predictions.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                    <SearchOutlined sx={{ fontSize: 36, mb: 1, color: '#8FA3B5' }} />
                    <Typography variant="body2">No predictions match the current filters.</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              predictions.map((p) => (
                <TableRow
                  key={p.id}
                  hover
                  onClick={() => onViewResult(p.scan_id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {new Date(p.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {p.scan?.anonymized_patient_id ? (
                      <Box
                        component="span"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (onOpenPatient && p.scan?.anonymized_patient_id) onOpenPatient(p.scan.anonymized_patient_id)
                        }}
                        sx={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: '0.8125rem',
                          color: onOpenPatient ? '#12507E' : 'text.primary',
                          cursor: onOpenPatient ? 'pointer' : 'default',
                          textDecoration: onOpenPatient ? 'underline dotted' : 'none',
                        }}
                      >
                        {p.scan.anonymized_patient_id}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {p.scan?.original_filename ?? '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.model_architecture}
                    </Typography>
                  </TableCell>
                  <TableCell><FindingChip prediction={p} /></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {Math.round(p.confidence * 100)}%
                    </Typography>
                    <Box sx={{ width: 90, height: 4, borderRadius: 2, backgroundColor: '#E3E8ED', mt: 0.5 }}>
                      <Box
                        sx={{
                          height: '100%',
                          borderRadius: 2,
                          width: `${Math.round(p.confidence * 100)}%`,
                          backgroundColor: p.is_low_confidence ? '#9A6700' : p.predicted_class !== 'Normal' && p.confidence >= 0.9 ? '#B3261E' : '#12507E',
                        }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {p.is_low_confidence && (
                        <Chip icon={<WarningAmberOutlined />} label="Low conf." size="small" variant="outlined" sx={{ color: '#9A6700', borderColor: '#D9BE8A' }} />
                      )}
                      {p.is_high_risk && (
                        <Chip icon={<WarningAmberOutlined />} label="High risk" size="small" variant="outlined" sx={{ color: '#B3261E', borderColor: '#E5B8B5' }} />
                      )}
                      {p.is_flagged && (
                        <Chip icon={<FlagOutlined />} label="Flagged" size="small" variant="outlined" sx={{ color: '#12507E', borderColor: '#9DB8CF' }} />
                      )}
                      {!p.is_low_confidence && !p.is_high_risk && !p.is_flagged && (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ color: '#12507E', fontWeight: 500 }}>
                      View →
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => onPageChange(p)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
        rowsPerPageOptions={[10, 25, 50]}
        labelRowsPerPage="Rows"
      />
    </Box>
  )
}
