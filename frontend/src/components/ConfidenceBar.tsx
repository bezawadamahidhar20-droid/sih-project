import { Box, Typography, Chip } from '@mui/material'
import {
  CheckCircleOutlineOutlined,
  ErrorOutlineOutlined,
  HelpOutlineOutlined,
  InfoOutlined,
} from '@mui/icons-material'

export interface ConfidenceThresholds {
  low: number // below this -> low confidence
  high: number // at/above this -> high confidence
}

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = { low: 0.7, high: 0.9 }

interface ConfidenceBarProps {
  confidence: number // 0..1
  thresholds?: ConfidenceThresholds
  label?: string
  showProbabilityTable?: boolean
  probabilities?: Record<string, number>
}

function confidenceLevel(confidence: number, t: ConfidenceThresholds) {
  if (confidence < t.low) return { key: 'low' as const, label: 'Low confidence', icon: <ErrorOutlineOutlined fontSize="small" /> }
  if (confidence >= t.high) return { key: 'high' as const, label: 'High confidence', icon: <CheckCircleOutlineOutlined fontSize="small" /> }
  return { key: 'moderate' as const, label: 'Moderate confidence', icon: <HelpOutlineOutlined fontSize="small" /> }
}

function barColor(key: 'low' | 'moderate' | 'high', isAbnormal: boolean) {
  if (key === 'low') return '#9A6700' // reserved amber accent
  if (key === 'high' && isAbnormal) return '#B3261E'
  return '#12507E'
}

export function ConfidenceBar({
  confidence,
  thresholds = DEFAULT_THRESHOLDS,
  label = 'Confidence',
  showProbabilityTable = false,
  probabilities,
}: ConfidenceBarProps) {
  const pct = Math.round(confidence * 100)
  const level = confidenceLevel(confidence, thresholds)
  const isAbnormal = probabilities
    ? (Object.entries(probabilities).find(([, v]) => v === Math.max(...Object.values(probabilities)))?.[0] ?? '') !== 'Normal'
    : false
  const color = barColor(level.key, isAbnormal)

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, color }}>
            {pct}%
          </Typography>
          <Chip
            icon={level.icon}
            label={level.label}
            size="small"
            variant="outlined"
            sx={{ color, borderColor: color }}
          />
        </Box>
      </Box>

      <Box sx={{ position: 'relative', height: 8, borderRadius: 2, backgroundColor: '#E3E8ED' }}>
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            borderRadius: 2,
            backgroundColor: color,
            transition: 'width 0.6s ease',
          }}
        />
        {/* threshold tick marks */}
        {[thresholds.low, thresholds.high].map((t) => (
          <Box
            key={t}
            sx={{
              position: 'absolute',
              top: -3,
              bottom: -3,
              width: 2,
              backgroundColor: '#8FA3B5',
              left: `${t * 100}%`,
            }}
            title={`Clinical threshold: ${Math.round(t * 100)}%`}
          />
        ))}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Clinical threshold {Math.round(thresholds.low * 100)}%
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {Math.round(thresholds.high * 100)}%
        </Typography>
      </Box>

      {level.key === 'low' && (
        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, color: '#9A6700' }}>
          <InfoOutlined fontSize="inherit" />
          Below clinical threshold — result should be treated as indeterminate and reviewed manually.
        </Typography>
      )}

      {showProbabilityTable && probabilities && Object.keys(probabilities).length > 0 && (
        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {Object.entries(probabilities)
            .sort((a, b) => b[1] - a[1])
            .map(([cls, prob]) => (
              <Box key={cls} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ width: 90, flexShrink: 0, color: 'text.secondary' }}>
                  {cls}
                </Typography>
                <Box sx={{ flex: 1, height: 5, borderRadius: 2, backgroundColor: '#E3E8ED' }}>
                  <Box
                    sx={{
                      height: '100%',
                      borderRadius: 2,
                      backgroundColor: '#8FA3B5',
                      width: `${Math.round(prob * 100)}%`,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </Box>
                <Typography variant="caption" sx={{ width: 42, textAlign: 'right' }}>
                  {Math.round(prob * 100)}%
                </Typography>
              </Box>
            ))}
        </Box>
      )}
    </Box>
  )
}
