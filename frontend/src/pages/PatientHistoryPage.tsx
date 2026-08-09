import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { Box, Typography, Card, CardContent, Alert, IconButton, Tooltip, Chip } from '@mui/material'
import { ArrowBackOutlined, RefreshOutlined, PersonOutlineOutlined } from '@mui/icons-material'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Prediction } from '../types'
import { PatientHistoryTable, HistoryFilters } from '../components/PatientHistoryTable'

export function PatientHistoryPage() {
  const { patientId = '' } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [all, setAll] = useState<Prediction[]>([])
  const [filters, setFilters] = useState<HistoryFilters>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isDoctor = hasRole(['doctor', 'radiologist'])

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const list = await api.getPatientHistory(patientId)
      setAll(list)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load patient history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  // Client-side filtering (the patient endpoint returns the full series).
  const filtered = useMemo(() => {
    return all.filter((p) => {
      if (filters.predictedClass && p.predicted_class !== filters.predictedClass) return false
      if (filters.minConfidence != null && p.confidence < filters.minConfidence) return false
      if (filters.flagged === 'flagged' && !p.is_flagged) return false
      if (filters.flagged === 'unflagged' && p.is_flagged) return false
      if (filters.recency && filters.recency !== 'all') {
        const days = Number(filters.recency)
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
        if (new Date(p.created_at).getTime() < cutoff) return false
      }
      return true
    })
  }, [all, filters])

  const availableClasses = useMemo(
    () => Array.from(new Set(['Normal', 'Pneumonia', ...all.map((p) => p.predicted_class)])),
    [all]
  )

  if (!isDoctor) {
    return <Navigate to="/upload" replace />
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton onClick={() => navigate('/history')} aria-label="Back to history">
            <ArrowBackOutlined />
          </IconButton>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
              Patient History
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonOutlineOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'ui-monospace, monospace' }}>
                {patientId}
              </Typography>
              <Chip label={`${all.length} scan${all.length === 1 ? '' : 's'}`} size="small" variant="outlined" />
            </Box>
          </Box>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} disabled={loading}>
            <RefreshOutlined />
          </IconButton>
        </Tooltip>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card>
        <CardContent>
          <PatientHistoryTable
            predictions={filtered}
            loading={loading}
            total={filtered.length}
            page={0}
            pageSize={25}
            filters={{ ...filters, patientId }}
            availableClasses={availableClasses}
            onFiltersChange={(next) => setFilters({ ...next, patientId: undefined })}
            onPageChange={() => undefined}
            onPageSizeChange={() => undefined}
            onViewResult={(scanId) => navigate(`/results/${scanId}`)}
            onOpenPatient={undefined}
          />
        </CardContent>
      </Card>
    </Box>
  )
}
