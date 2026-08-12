import { useState, useMemo } from 'react';
import {
  Box,
  Card,
  Typography,
  Stack,
  Slider,
  Button,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Tooltip,
} from '@mui/material';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import CenterFocusStrongRoundedIcon from '@mui/icons-material/CenterFocusStrongRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import ThreeDRotationRoundedIcon from '@mui/icons-material/ThreeDRotationRounded';
import { AuthImage } from '../common/AuthImage';
import { ThreeDMedicalScene } from '../common/ThreeDMedicalScene';
import { tokens } from '../../theme';

interface ThreeDScanViewerProps {
  scanImageUrl?: string | null;
  heatmapUrl?: string | null;
  findingsCount?: number;
  confidenceScore?: number;
}

export function ThreeDScanViewer({
  scanImageUrl,
  heatmapUrl,
  findingsCount = 1,
  confidenceScore = 0.94,
}: ThreeDScanViewerProps) {
  const [slicePosition, setSlicePosition] = useState<number>(50);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(75);
  const [huPreset, setHuPreset] = useState<'lung' | 'bone' | 'soft'>('lung');
  const [viewPlane, setViewPlane] = useState<'axial' | 'coronal' | 'sagittal'>('axial');
  const [show3dMesh, setShow3dMesh] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);

  // Default fallback images if urls are not provided
  const activeScanUrl = scanImageUrl || '/scans/scan_1.png';
  const activeHeatmapUrl = heatmapUrl || '/scans/scan_2.png';

  // Compute CSS filter for Hounsfield Unit (HU) windowing simulation
  const huFilter = useMemo(() => {
    switch (huPreset) {
      case 'lung':
        // High contrast for pulmonary parenchyma
        return 'contrast(140%) brightness(115%) grayscale(90%)';
      case 'bone':
        // High density bone window
        return 'contrast(200%) brightness(85%) grayscale(100%)';
      case 'soft':
        // Smooth soft-tissue contrast window
        return 'contrast(105%) brightness(100%) grayscale(80%)';
      default:
        return 'none';
    }
  }, [huPreset]);

  // Compute crosshair & slice geometry offset based on slicePosition (0 - 100)
  const sliceYPercent = useMemo(() => {
    return Math.max(10, Math.min(90, slicePosition));
  }, [slicePosition]);

  const resetControls = () => {
    setSlicePosition(50);
    setHeatmapOpacity(75);
    setHuPreset('lung');
    setViewPlane('axial');
    setShowHeatmap(true);
    setShow3dMesh(true);
  };

  return (
    <Card
      sx={{
        p: 2.5,
        borderRadius: 4,
        bgcolor: tokens.surfaceDark,
        border: `1px solid ${tokens.surfaceBorder}`,
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
      }}
    >
      <Stack spacing={2}>
        {/* Header Toolbar */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2.5,
                bgcolor: 'rgba(0, 180, 216, 0.15)',
                color: tokens.cyan,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${tokens.cyan}`,
              }}
            >
              <LayersRoundedIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" component="div" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
                3D Volumetric Scan & Heatmap Viewer
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Multi-planar slice height index & Grad-CAM thermal density blending
              </Typography>
            </Box>
          </Stack>

          {/* Plane Selector & View Controls */}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <ToggleButtonGroup
              size="small"
              value={viewPlane}
              exclusive
              onChange={(_, val) => val && setViewPlane(val)}
              sx={{
                bgcolor: 'rgba(7, 12, 18, 0.8)',
                '& .MuiToggleButton-root': {
                  color: tokens.textSecondary,
                  px: 1.5,
                  py: 0.5,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  '&.Mui-selected': {
                    color: tokens.cyan,
                    bgcolor: 'rgba(0, 180, 216, 0.15)',
                  },
                },
              }}
            >
              <ToggleButton value="axial">Axial</ToggleButton>
              <ToggleButton value="coronal">Coronal</ToggleButton>
              <ToggleButton value="sagittal">Sagittal</ToggleButton>
            </ToggleButtonGroup>

            <Tooltip title="Toggle 3D Organ Mesh Overlay">
              <IconButton
                size="small"
                onClick={() => setShow3dMesh((v) => !v)}
                sx={{
                  color: show3dMesh ? tokens.cyan : tokens.textSecondary,
                  bgcolor: show3dMesh ? 'rgba(0, 180, 216, 0.12)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${show3dMesh ? tokens.cyan : tokens.surfaceBorder}`,
                }}
              >
                <ThreeDRotationRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Reset View Settings">
              <IconButton size="small" onClick={resetControls} sx={{ color: tokens.textSecondary }}>
                <RestartAltRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* 3D Scene / Slice Display Stage Box */}
        <Box
          sx={{
            position: 'relative',
            height: 380,
            width: '100%',
            borderRadius: 3.5,
            overflow: 'hidden',
            bgcolor: '#04080D',
            border: '1px solid rgba(0, 180, 216, 0.25)',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Layer 1: Base Scan Image Slice */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              filter: huFilter,
              transform: `scale(${1 + (slicePosition - 50) * 0.003})`,
              transition: 'filter 0.3s ease, transform 0.15s ease-out',
            }}
          >
            <AuthImage
              src={activeScanUrl}
              alt="DICOM Scan Slice"
              objectFit="contain"
              sx={{ width: '100%', height: '100%' }}
            />
          </Box>

          {/* Layer 2: Grad-CAM Heatmap Overlay (opacity controlled LIVE by slider) */}
          {showHeatmap && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: heatmapOpacity / 100,
                mixBlendMode: 'screen',
                filter: 'hue-rotate(-20deg) contrast(150%) saturate(180%)',
                transition: 'opacity 0.1s linear',
                pointerEvents: 'none',
              }}
            >
              <AuthImage
                src={activeHeatmapUrl}
                alt="Grad-CAM Heatmap Blend"
                objectFit="contain"
                sx={{ width: '100%', height: '100%' }}
              />
            </Box>
          )}

          {/* Layer 3: Optional 3D Holographic Scene Wireframe Background */}
          {show3dMesh && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                opacity: 0.35,
                pointerEvents: 'none',
                mixBlendMode: 'screen',
              }}
            >
              <ThreeDMedicalScene />
            </Box>
          )}

          {/* Layer 4: Volumetric Slice Height Target Indicator & Crosshair */}
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${sliceYPercent}%`,
              height: '1px',
              bgcolor: 'rgba(0, 180, 216, 0.75)',
              boxShadow: '0 0 8px #00B4D8, 0 0 16px #00B4D8',
              pointerEvents: 'none',
              transition: 'top 0.05s linear',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                right: 12,
                top: -10,
                color: tokens.cyan,
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                bgcolor: 'rgba(7, 12, 18, 0.9)',
                px: 0.8,
                py: 0.2,
                borderRadius: 1,
                border: '1px solid rgba(0, 180, 216, 0.4)',
              }}
            >
              PLANE {viewPlane.toUpperCase()} z={slicePosition}mm
            </Typography>
          </Box>

          {/* Overlay Status Chips Top-Left */}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 2,
            }}
          >
            <Chip
              label={`Slice ${slicePosition} / 100 (${viewPlane.toUpperCase()})`}
              size="small"
              sx={{
                bgcolor: 'rgba(7, 12, 18, 0.85)',
                color: tokens.textPrimary,
                backdropFilter: 'blur(10px)',
                border: `1px solid ${tokens.surfaceBorder}`,
              }}
            />
            <Chip
              label={`HU: ${huPreset.toUpperCase()}`}
              size="small"
              sx={{
                bgcolor: 'rgba(0, 180, 216, 0.15)',
                color: tokens.cyan,
                border: `1px solid ${tokens.cyan}`,
                fontWeight: 700,
              }}
            />
          </Stack>

          {/* Overlay Status Chips Bottom-Right */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              zIndex: 2,
            }}
          >
            <Chip
              icon={<CenterFocusStrongRoundedIcon style={{ color: tokens.confidenceHigh }} />}
              label={`Grad-CAM ROI Blend (${findingsCount} finding${findingsCount > 1 ? 's' : ''}, ${(confidenceScore * 100).toFixed(0)}% score)`}
              size="small"
              sx={{
                bgcolor: 'rgba(16, 185, 129, 0.15)',
                color: tokens.confidenceHigh,
                border: `1px solid ${tokens.confidenceHigh}`,
                backdropFilter: 'blur(10px)',
                fontWeight: 600,
              }}
            />
          </Box>
        </Box>

        {/* Sliders & Controls Bar */}
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: 'center' }}>
            {/* Slice Height Index Slider */}
            <Box sx={{ width: '100%' }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
                  Volumetric Slice Height Index
                </Typography>
                <Typography variant="caption" sx={{ color: tokens.cyan, fontFamily: 'monospace', fontWeight: 700 }}>
                  Slice {slicePosition} / 100
                </Typography>
              </Stack>
              <Slider
                size="small"
                value={slicePosition}
                min={1}
                max={100}
                onChange={(_, v) => setSlicePosition(v as number)}
                sx={{
                  color: tokens.cyan,
                  '& .MuiSlider-thumb': {
                    boxShadow: '0 0 10px #00B4D8',
                  },
                }}
              />
            </Box>

            {/* Grad-CAM Heatmap Opacity Slider */}
            <Box sx={{ width: '100%' }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
                    Grad-CAM Heatmap Blend Density
                  </Typography>
                  <Tooltip title={showHeatmap ? 'Hide Heatmap Overlay' : 'Show Heatmap Overlay'}>
                    <IconButton
                      size="small"
                      onClick={() => setShowHeatmap((s) => !s)}
                      sx={{ p: 0.2, color: showHeatmap ? tokens.confidenceHigh : tokens.textSecondary }}
                    >
                      {showHeatmap ? <VisibilityRoundedIcon style={{ fontSize: 16 }} /> : <VisibilityOffRoundedIcon style={{ fontSize: 16 }} />}
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Typography variant="caption" sx={{ color: tokens.confidenceHigh, fontFamily: 'monospace', fontWeight: 700 }}>
                  {showHeatmap ? `${heatmapOpacity}% Opacity` : 'Hidden'}
                </Typography>
              </Stack>
              <Slider
                size="small"
                value={heatmapOpacity}
                min={0}
                max={100}
                disabled={!showHeatmap}
                onChange={(_, v) => setHeatmapOpacity(v as number)}
                sx={{
                  color: tokens.confidenceHigh,
                  '& .MuiSlider-thumb': {
                    boxShadow: '0 0 10px #10B981',
                  },
                }}
              />
            </Box>
          </Stack>

          {/* HU Windowing Presets */}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ color: tokens.textSecondary, fontWeight: 600 }}>
              Hounsfield Unit (HU) Windowing:
            </Typography>
            {[
              { id: 'lung' as const, label: 'Lung (-600 / 1500 HU)' },
              { id: 'bone' as const, label: 'Bone (+300 / 2000 HU)' },
              { id: 'soft' as const, label: 'Soft Tissue (+40 / 400 HU)' },
            ].map((p) => (
              <Button
                key={p.id}
                size="small"
                variant={huPreset === p.id ? 'contained' : 'outlined'}
                onClick={() => setHuPreset(p.id)}
                sx={{
                  py: 0.4,
                  px: 1.8,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderColor: huPreset === p.id ? tokens.cyan : tokens.surfaceBorder,
                  color: huPreset === p.id ? '#070C12' : tokens.textPrimary,
                  bgcolor: huPreset === p.id ? tokens.cyan : 'rgba(7, 12, 18, 0.4)',
                  '&:hover': {
                    bgcolor: huPreset === p.id ? tokens.cyan : 'rgba(0, 180, 216, 0.15)',
                  },
                }}
              >
                {p.label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}

export default ThreeDScanViewer;
