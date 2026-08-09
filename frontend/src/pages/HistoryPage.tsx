import { useCallback, useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Box, Typography, Card, CardContent, Alert, IconButton, Tooltip } from '@mui/material'
import { RefreshOutlined, HistoryOutlined } from '@mui/icons-material'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Prediction } from '../types'
import {
  PatientHistoryTable,
  HistoryFilters,
} from '../components/PatientHistoryTable'

const DEFAULT_CLASSES = ['Normal', 'Pneumonia']

export function HistoryPage() {
  const navigate = useNavigate()
  const { hasRole, user } = useAuth()
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState<HistoryFilters>({})
  const [availableClasses, setAvailableClasses] = useState<string[]>(DEFAULT_CLASSES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isDoctor = hasRole(['doctor', 'radiologist'])

  const fromDateFor = (recency?: string): string | undefined => {
    if (!recency || recency === 'all') return undefined
    const days = Number(recency)
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.getPredictions({
        page: page + 1,
        page_size: pageSize,
        patient_id: filters.patientId || undefined,
        predicted_class: filters.predictedClass || undefined,
        min_confidence: filters.minConfidence,
        flagged: filters.flagged === 'flagged' ? true : filters.flagged === 'unflagged' ? false : undefined,
        from_date: fromDateFor(filters.recency),
      })
      setPredictions(response.predictions)
      setTotal(response.total)
      setAvailableClasses((prev) => Array.from(new Set([...DEFAULT_CLASSES, ...prev, ...response.predictions.map((p) => p.predicted_class)])))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load prediction history.')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (!isDoctor) {
    return <Navigate to="/upload" replace />
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
            Prediction History
          </Typography>
          <Typography variant="body2" color="text.secondary">
            All analyzed scans with anonymized patient identifiers ({user?.role} view)
          </Typography>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <HistoryOutlined sx={{ color: 'text.secondary' }} />
            <Typography variant="subtitle2" color="text.secondary">
              {total} prediction{total === 1 ? '' : 's'} found
            </Typography>
          </Box>
          <PatientHistoryTable
            predictions={predictions}
            loading={loading}
            total={total}
            page={page}
            pageSize={pageSize}
            filters={filters}
            availableClasses={availableClasses}
            onFiltersChange={(next) => {
              setFilters(next)
              setPage(0)
            }}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(0)
            }}
            onViewResult={(scanId) => navigate(`/results/${scanId}`)}
            onOpenPatient={(patientId) => navigate(`/patient/${encodeURIComponent(patientId)}`)}
          />
        </CardContent>
      </Card>
    </Box>
  )
}
