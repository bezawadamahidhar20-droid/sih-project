import { useCallback, useState } from 'react';
import {
  Box,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Typography,
  Slider,
  Tooltip,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import { AuthImage } from '../common/AuthImage';

export type ScanViewMode = 'original' | 'overlay' | 'compare';

interface ScanViewerProps {
  originalUrl?: string | null;
  overlayUrl?: string | null;
  filename?: string | null;
  loading?: boolean;
  loadingLabel?: string;
}

export function ScanViewer({
  originalUrl,
  overlayUrl,
  filename,
  loading = false,
  loadingLabel = 'Analyzing scan…',
}: ScanViewerProps) {
  const [mode, setMode] = useState<ScanViewMode>('overlay');
  const [opacity, setOpacity] = useState(55);
  const [zoom, setZoom] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 3)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.5)), []);
  const reset = useCallback(() => {
    setZoom(1);
    setOpacity(55);
    setShowOverlay(true);
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#0b1620',
        borderRadius: 3,
        overflow: 'hidden',
        border: '1px solid #1c2b38',
        height: '100%',
      }}
    >
      {/* Toolbar */}
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, bgcolor: '#101f2c', borderBottom: '1px solid #1c2b38' }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, v) => v && setMode(v)}
          sx={{
            '& .MuiToggleButton-root': {
              color: '#8fa4b3',
              borderColor: '#1c2b38',
              px: 1.5,
              '&.Mui-selected': { bgcolor: 'primary.main', color: '#fff' },
            },
          }}
        >
          <ToggleButton value="original">
            <ImageRoundedIcon sx={{ fontSize: 16, mr: 0.75 }} /> Original
          </ToggleButton>
          <ToggleButton value="overlay">
            <LayersRoundedIcon sx={{ fontSize: 16, mr: 0.75 }} /> AI Overlay
          </ToggleButton>
          <ToggleButton value="compare">
            <ViewColumnRoundedIcon sx={{ fontSize: 16, mr: 0.75 }} /> Compare
          </ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
          <Tooltip title="Zoom out">
            <IconButton size="small" onClick={zoomOut} sx={{ color: '#8fa4b3' }}>
              <ZoomOutRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" sx={{ color: '#8fa4b3', width: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <Tooltip title="Zoom in">
            <IconButton size="small" onClick={zoomIn} sx={{ color: '#8fa4b3' }}>
              <ZoomInRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset view">
            <IconButton size="small" onClick={reset} sx={{ color: '#8fa4b3' }}>
              <RestartAltRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {mode === 'overlay' && overlayUrl && (
            <Tooltip title={showOverlay ? 'Hide overlay' : 'Show overlay'}>
              <IconButton size="small" onClick={() => setShowOverlay((s) => !s)} sx={{ color: '#8fa4b3' }}>
                {showOverlay ? <VisibilityRoundedIcon fontSize="small" /> : <VisibilityOffRoundedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      {filename && (
        <Box sx={{ px: 2, py: 0.75, bgcolor: '#101f2c', borderBottom: '1px solid #1c2b38' }}>
          <Typography variant="caption" sx={{ color: '#5d7386', fontFamily: 'monospace' }} noWrap>
            {filename}
          </Typography>
        </Box>
      )}

      {/* Image canvas */}
      <Box sx={{ flex: 1, position: 'relative', minHeight: 420, overflow: 'hidden' }}>
        {loading ? (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2.5,
              color: '#8fa4b3',
            }}
          >
            <CircularProgress size={44} sx={{ color: 'primary.light' }} />
            <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#cfe0ea', fontWeight: 600 }}>
                {loadingLabel}
              </Typography>
              <Typography variant="caption" sx={{ color: '#5d7386' }}>
                Preparing explainability visualization…
              </Typography>
            </Stack>
            <Box sx={{ width: 200 }}>
              <LinearProgress sx={{ bgcolor: '#1c2b38', '& .MuiLinearProgress-bar': { bgcolor: 'primary.light' } }} />
            </Box>
          </Box>
        ) : mode === 'compare' ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <Box sx={{ position: 'relative', overflow: 'hidden', borderRight: '1px solid #1c2b38' }}>
              <Box sx={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transition: 'transform .2s' }}>
                <AuthImage src={originalUrl} alt="Original scan" objectFit="contain" />
              </Box>
              <Box sx={{ position: 'absolute', bottom: 8, left: 8, px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(16,31,44,0.85)' }}>
                <Typography variant="caption" sx={{ color: '#cfe0ea' }}>Original</Typography>
              </Box>
            </Box>
            <Box sx={{ position: 'relative', overflow: 'hidden' }}>
              <Box sx={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transition: 'transform .2s' }}>
                <AuthImage src={overlayUrl} alt="AI overlay" objectFit="contain" />
              </Box>
              <Box sx={{ position: 'absolute', bottom: 8, right: 8, px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(16,31,44,0.85)' }}>
                <Typography variant="caption" sx={{ color: '#cfe0ea' }}>AI Overlay</Typography>
              </Box>
            </Box>
          </Box>
        ) : (
          <Box sx={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transition: 'transform .2s' }}>
            <AuthImage src={originalUrl} alt="Scan image" objectFit="contain" />
            {mode === 'overlay' && overlayUrl && showOverlay && (
              <Box sx={{ position: 'absolute', inset: 0, opacity: opacity / 100 }}>
                <AuthImage src={overlayUrl} alt="Grad-CAM heatmap" objectFit="contain" />
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Opacity slider */}
      {!loading && mode === 'overlay' && overlayUrl && showOverlay && (
        <Box sx={{ px: 2.5, py: 1.75, bgcolor: '#101f2c', borderTop: '1px solid #1c2b38' }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: '#8fa4b3', flexShrink: 0 }}>
              Heatmap opacity
            </Typography>
            <Slider
              size="small"
              value={opacity}
              onChange={(_, v) => setOpacity(v as number)}
              min={0}
              max={100}
              sx={{
                color: 'primary.light',
                '& .MuiSlider-rail': { bgcolor: '#1c2b38' },
              }}
            />
            <Typography variant="caption" sx={{ color: '#cfe0ea', width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {opacity}%
            </Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
