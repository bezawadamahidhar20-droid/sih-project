import React, { useState } from 'react'
import {
  Box,
  Typography,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
} from '@mui/material'
import {
  ImageOutlined,
  LayersOutlined,
  CompareOutlined,
  MonitorHeartOutlined,
} from '@mui/icons-material'
import { AuthImage } from './AuthImage'

export type ScanViewMode = 'original' | 'overlay' | 'compare'

interface ScanViewerProps {
  originalUrl?: string | null
  overlayUrl?: string | null
  filename?: string | null
  loading?: boolean
  loadingLabel?: string
}

/**
 * The diagnostic viewer. Supports:
 *  - Original scan only
 *  - Grad-CAM heatmap overlay (opacity adjustable with a slider)
 *  - Side-by-side comparison
 * A pulse animation + thin progress bar communicates that inference is running.
 */
export function ScanViewer({
  originalUrl,
  overlayUrl,
  filename,
  loading = false,
  loadingLabel = 'Analyzing scan…',
}: ScanViewerProps) {
  const [mode, setMode] = useState<ScanViewMode>('original')
  const [opacity, setOpacity] = useState(55)

  const handleMode = (_: React.MouseEvent<HTMLElement>, next: ScanViewMode | null) => {
    if (next) setMode(next)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <MonitorHeartOutlined sx={{ fontSize: 20, color: 'text.secondary' }} />
          <Typography variant="subtitle2" color="text.secondary" noWrap>
            {filename || 'Scan image'}
          </Typography>
        </Box>
        <ToggleButtonGroup value={mode} exclusive onChange={handleMode} size="small" disabled={loading}>
          <ToggleButton value="original" aria-label="Show original scan">
            <ImageOutlined sx={{ mr: 0.75, fontSize: 18 }} /> Original
          </ToggleButton>
          <ToggleButton value="overlay" aria-label="Show heatmap overlay" disabled={!overlayUrl}>
            <LayersOutlined sx={{ mr: 0.75, fontSize: 18 }} /> AI overlay
          </ToggleButton>
          <ToggleButton value="compare" aria-label="Compare original and overlay" disabled={!overlayUrl}>
            <CompareOutlined sx={{ mr: 0.75, fontSize: 18 }} /> Compare
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box
        sx={{
          border: 1,
          borderColor: '#DCE1E7',
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: '#10161D',
          position: 'relative',
        }}
      >
        {loading ? (
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4 / 3',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              '@keyframes mediscan-pulse': {
                '0%': { opacity: 0.55 },
                '50%': { opacity: 1 },
                '100%': { opacity: 0.55 },
              },
              animation: 'mediscan-pulse 1.6s ease-in-out infinite',
            }}
            role="status"
            aria-live="polite"
          >
            <Box
              sx={{
                width: 120,
                height: 120,
                border: '2px solid #3A74A6',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MonitorHeartOutlined sx={{ fontSize: 44, color: '#7FA3C4' }} />
            </Box>
            <Typography variant="body2" sx={{ mt: 2, color: '#C7D4E0' }}>
              {loadingLabel}
            </Typography>
            <Typography variant="caption" sx={{ mt: 0.5, color: '#8FA3B5' }}>
              Model inference in progress — this may take a few seconds.
            </Typography>
          </Box>
        ) : mode === 'original' ? (
          <AuthImage src={originalUrl} alt={`Original scan ${filename || ''}`} />
        ) : mode === 'overlay' ? (
          <Box sx={{ position: 'relative', width: '100%', aspectRatio: '4 / 3' }}>
            <Box sx={{ position: 'absolute', inset: 0 }}>
              <AuthImage src={originalUrl} alt="Original scan" />
            </Box>
            <Box sx={{ position: 'absolute', inset: 0, opacity: opacity / 100 }}>
              <AuthImage src={overlayUrl} alt="Grad-CAM heatmap overlay" />
            </Box>
            <Box
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: 'rgba(16,22,29,0.82)',
                color: '#C7D4E0',
                fontSize: '0.6875rem',
                px: 1,
                py: 0.5,
                borderRadius: 0.5,
              }}
            >
              Grad-CAM · opacity {opacity}%
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <Box sx={{ position: 'relative' }}>
              <Typography variant="caption" sx={{ position: 'absolute', zIndex: 1, m: 1, px: 1, py: 0.5, backgroundColor: 'rgba(16,22,29,0.82)', color: '#C7D4E0', borderRadius: 0.5 }}>
                Original
              </Typography>
              <AuthImage src={originalUrl} alt="Original scan" aspectRatio="4 / 3" />
            </Box>
            <Box sx={{ position: 'relative' }}>
              <Typography variant="caption" sx={{ position: 'absolute', zIndex: 1, m: 1, px: 1, py: 0.5, backgroundColor: 'rgba(16,22,29,0.82)', color: '#C7D4E0', borderRadius: 0.5 }}>
                AI overlay
              </Typography>
              <AuthImage src={overlayUrl} alt="Grad-CAM heatmap overlay" aspectRatio="4 / 3" />
            </Box>
          </Box>
        )}
      </Box>

      {!loading && overlayUrl && mode !== 'original' && (
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 110 }}>
            Heatmap opacity
          </Typography>
          <Slider
            value={opacity}
            onChange={(_, v) => setOpacity(v as number)}
            min={10}
            max={100}
            step={5}
            valueLabelDisplay="auto"
            aria-label="Heatmap overlay opacity"
            sx={{ maxWidth: 320 }}
          />
          <Typography variant="caption" color="text.secondary">
            {opacity}%
          </Typography>
        </Box>
      )}

      {loading && (
        <LinearProgress sx={{ mt: 1, height: 4 }} />
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Highlighted regions indicate where the model directed its attention. AI output is decision-support only.
      </Typography>
    </Box>
  )
}
