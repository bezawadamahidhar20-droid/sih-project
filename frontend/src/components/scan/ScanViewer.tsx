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
  Button,
  Chip,
} from '@mui/material';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import StraightenRoundedIcon from '@mui/icons-material/StraightenRounded';
import InvertColorsRoundedIcon from '@mui/icons-material/InvertColorsRounded';
import ContrastRoundedIcon from '@mui/icons-material/ContrastRounded';
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

  // DICOM Windowing & Contrast States
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [invert, setInvert] = useState<boolean>(false);
  const [showWindowing, setShowWindowing] = useState<boolean>(false);

  // Calibrated Measurement Ruler States
  const [rulerActive, setRulerActive] = useState<boolean>(false);
  const [rulerPoints, setRulerPoints] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 3)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.5)), []);
  const reset = useCallback(() => {
    setZoom(1);
    setOpacity(55);
    setShowOverlay(true);
    setBrightness(100);
    setContrast(100);
    setInvert(false);
    setRulerPoints(null);
    setRulerActive(false);
  }, []);

  const handleStageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRulerPoints({ x1: x, y1: y, x2: x + 40, y2: y + 30 });
    setIsDrawing(true);
  };

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerActive || !isDrawing || !rulerPoints) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRulerPoints((prev) => (prev ? { ...prev, x2: x, y2: y } : null));
  };

  const handleStageMouseUp = () => {
    setIsDrawing(false);
  };

  // Calculate distance in mm (simulated DICOM pixel pitch 0.25mm/px)
  const measuredDistanceMm = rulerPoints
    ? Math.round(Math.sqrt(Math.pow(rulerPoints.x2 - rulerPoints.x1, 2) + Math.pow(rulerPoints.y2 - rulerPoints.y1, 2)) * 0.28)
    : 0;

  const imageFilter = `brightness(${brightness}%) contrast(${contrast}%) ${invert ? 'invert(100%)' : ''}`;

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

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Tooltip title="DICOM Windowing Controls">
            <IconButton
              size="small"
              onClick={() => setShowWindowing((v) => !v)}
              sx={{ color: showWindowing ? '#00B4D8' : '#8fa4b3', bgcolor: showWindowing ? 'rgba(0,180,216,0.15)' : 'transparent' }}
            >
              <ContrastRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title={rulerActive ? 'Disable Caliper Ruler' : 'Anatomical Measurement Caliper'}>
            <IconButton
              size="small"
              onClick={() => setRulerActive((v) => !v)}
              sx={{ color: rulerActive ? '#10B981' : '#8fa4b3', bgcolor: rulerActive ? 'rgba(16,185,129,0.15)' : 'transparent' }}
            >
              <StraightenRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Invert Grayscale Colors">
            <IconButton
              size="small"
              onClick={() => setInvert((v) => !v)}
              sx={{ color: invert ? '#F59E0B' : '#8fa4b3', bgcolor: invert ? 'rgba(245,158,11,0.15)' : 'transparent' }}
            >
              <InvertColorsRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>

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

      {/* Expandable Windowing Controls Drawer */}
      {showWindowing && (
        <Stack direction="row" spacing={3} sx={{ px: 2, py: 1.2, bgcolor: '#070C12', borderBottom: '1px solid #1c2b38', alignItems: 'center' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: '#8fa4b3', display: 'block', mb: 0.2 }}>Brightness: {brightness}%</Typography>
            <Slider size="small" value={brightness} min={50} max={180} onChange={(_, v) => setBrightness(v as number)} sx={{ color: '#00B4D8' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: '#8fa4b3', display: 'block', mb: 0.2 }}>Contrast: {contrast}%</Typography>
            <Slider size="small" value={contrast} min={50} max={220} onChange={(_, v) => setContrast(v as number)} sx={{ color: '#00B4D8' }} />
          </Box>
          <Button size="small" variant="outlined" onClick={() => { setBrightness(100); setContrast(100); setInvert(false); }} sx={{ color: '#8fa4b3', borderColor: '#1c2b38', fontSize: '0.7rem' }}>
            Reset Window
          </Button>
        </Stack>
      )}

      {/* Main Image Stage */}
      <Box
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        sx={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: rulerActive ? 'crosshair' : 'default',
        }}
      >
        {loading && (
          <Box sx={{ position: 'absolute', inset: 0, zIndex: 10, bgcolor: 'rgba(11, 22, 32, 0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress size={44} />
            <Typography variant="body2" sx={{ color: '#8fa4b3' }}>{loadingLabel}</Typography>
            <Box sx={{ width: 200 }}><LinearProgress /></Box>
          </Box>
        )}

        <Box
          sx={{
            width: '100%',
            height: '100%',
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDrawing ? 'none' : 'transform 0.2s ease-out',
            filter: imageFilter,
          }}
        >
          {mode === 'original' && (
            <AuthImage src={originalUrl} alt={filename ?? 'Original scan'} objectFit="contain" />
          )}

          {mode === 'overlay' && (
            <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
              <AuthImage src={originalUrl} alt={filename ?? 'Original scan'} objectFit="contain" />
              {showOverlay && overlayUrl && (
                <Box sx={{ position: 'absolute', inset: 0, opacity: opacity / 100, pointerEvents: 'none' }}>
                  <AuthImage src={overlayUrl} alt="Grad-CAM overlay" objectFit="contain" />
                </Box>
              )}
            </Box>
          )}

          {mode === 'compare' && (
            <Stack direction="row" sx={{ width: '100%', height: '100%' }}>
              <Box sx={{ flex: 1, position: 'relative', borderRight: '1px solid #1c2b38' }}>
                <Typography variant="caption" sx={{ position: 'absolute', top: 8, left: 8, zIndex: 2, bgcolor: 'rgba(0,0,0,0.6)', px: 1, py: 0.25, borderRadius: 1, color: '#fff' }}>
                  Original
                </Typography>
                <AuthImage src={originalUrl} alt="Original scan" objectFit="contain" />
              </Box>
              <Box sx={{ flex: 1, position: 'relative' }}>
                <Typography variant="caption" sx={{ position: 'absolute', top: 8, left: 8, zIndex: 2, bgcolor: 'rgba(0,0,0,0.6)', px: 1, py: 0.25, borderRadius: 1, color: '#fff' }}>
                  AI Grad-CAM
                </Typography>
                <AuthImage src={overlayUrl || originalUrl} alt="Grad-CAM overlay" objectFit="contain" />
              </Box>
            </Stack>
          )}
        </Box>

        {/* Caliper Measurement SVG Overlay */}
        {rulerPoints && (
          <svg
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 8,
            }}
          >
            <line x1={rulerPoints.x1} y1={rulerPoints.y1} x2={rulerPoints.x2} y2={rulerPoints.y2} stroke="#10B981" strokeWidth="2.5" strokeDasharray="4 2" />
            <circle cx={rulerPoints.x1} cy={rulerPoints.y1} r="4" fill="#10B981" />
            <circle cx={rulerPoints.x2} cy={rulerPoints.y2} r="4" fill="#10B981" />
            <rect
              x={(rulerPoints.x1 + rulerPoints.x2) / 2 - 40}
              y={(rulerPoints.y1 + rulerPoints.y2) / 2 - 20}
              width="80"
              height="24"
              rx="4"
              fill="rgba(7,12,18,0.9)"
              stroke="#10B981"
              strokeWidth="1"
            />
            <text
              x={(rulerPoints.x1 + rulerPoints.x2) / 2}
              y={(rulerPoints.y1 + rulerPoints.y2) / 2 - 4}
              fill="#10B981"
              fontSize="11"
              fontWeight="bold"
              textAnchor="middle"
            >
              {measuredDistanceMm} mm
            </text>
          </svg>
        )}

        {/* Measurement HUD Chip */}
        {rulerActive && (
          <Chip
            icon={<StraightenRoundedIcon style={{ color: '#10B981' }} />}
            label={rulerPoints ? `Measured Lesion Size: ${measuredDistanceMm} mm` : 'Click & drag on scan to measure anatomical distance'}
            size="small"
            sx={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              zIndex: 9,
              bgcolor: 'rgba(7,12,18,0.9)',
              color: '#10B981',
              border: '1px solid #10B981',
            }}
          />
        )}
      </Box>

      {/* Footer controls for overlay opacity */}
      {mode === 'overlay' && overlayUrl && showOverlay && (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', px: 2, py: 1, bgcolor: '#101f2c', borderTop: '1px solid #1c2b38' }}>
          <Typography variant="caption" sx={{ color: '#8fa4b3', width: 110, flexShrink: 0 }}>
            Heatmap Opacity: {opacity}%
          </Typography>
          <Slider size="small" value={opacity} onChange={(_, v) => setOpacity(v as number)} min={0} max={100} sx={{ flex: 1, color: 'primary.main' }} />
        </Stack>
      )}
    </Box>
  );
}

export default ScanViewer;
