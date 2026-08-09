import { useState, useCallback } from 'react';
import {
  Image as ImageIcon,
  Layers,
  Columns,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AuthImage } from './AuthImage';
import { Skeleton } from './LoadingSkeleton';

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
  const [mode, setMode] = useState<ScanViewMode>('original');
  const [opacity, setOpacity] = useState(55);
  const [zoom, setZoom] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);

  const handleZoomIn = useCallback(
    () => setZoom((z) => Math.min(z + 0.25, 3)),
    []
  );
  const handleZoomOut = useCallback(
    () => setZoom((z) => Math.max(z - 0.25, 0.5)),
    []
  );
  const handleReset = useCallback(() => {
    setZoom(1);
    setOpacity(55);
    setMode('original');
    setShowOverlay(true);
  }, []);

  const modes: { key: ScanViewMode; icon: typeof ImageIcon; label: string }[] =
    [
      { key: 'original', icon: ImageIcon, label: 'Original' },
      { key: 'overlay', icon: Layers, label: 'AI Overlay' },
      { key: 'compare', icon: Columns, label: 'Compare' },
    ];

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        {/* Mode toggles */}
        <div className="flex items-center gap-1">
          {modes.map((m) => {
            const Icon = m.icon;
            const isActive = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title={m.label}
                aria-pressed={isActive}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-400 font-mono w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-slate-700 mx-1" />
          <button
            onClick={handleReset}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
            title="Reset view"
            aria-label="Reset view"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {mode === 'overlay' && overlayUrl && (
            <button
              onClick={() => setShowOverlay((s) => !s)}
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
              title={showOverlay ? 'Hide overlay' : 'Show overlay'}
              aria-label={showOverlay ? 'Hide overlay' : 'Show overlay'}
            >
              {showOverlay ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* File label */}
      {filename && (
        <div className="px-4 py-1.5 bg-slate-900 border-b border-slate-800">
          <p className="text-xs text-slate-500 font-mono truncate">{filename}</p>
        </div>
      )}

      {/* Image area */}
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: 300 }}>
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
            <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-slate-300">{loadingLabel}</p>
              <p className="text-xs text-slate-500">
                Preparing explainability visualization…
              </p>
            </div>
            <div className="w-48 h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600 animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ width: '60%' }} />
            </div>
          </div>
        ) : mode === 'compare' ? (
          <div className="absolute inset-0 grid grid-cols-2 divide-x divide-slate-700">
            <div className="relative overflow-hidden">
              <div
                className="absolute inset-0 transition-transform duration-300"
                style={{ transform: `scale(${zoom})` }}
              >
                <AuthImage src={originalUrl} alt="Original scan" objectFit="contain" />
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-800/80 text-xs text-slate-300 backdrop-blur-sm">
                Original
              </div>
            </div>
            <div className="relative overflow-hidden">
              <div
                className="absolute inset-0 transition-transform duration-300"
                style={{ transform: `scale(${zoom})` }}
              >
                <AuthImage src={overlayUrl} alt="AI overlay" objectFit="contain" />
              </div>
              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-slate-800/80 text-xs text-slate-300 backdrop-blur-sm">
                AI Overlay
              </div>
            </div>
          </div>
        ) : (
          <div
            className="absolute inset-0 transition-transform duration-300"
            style={{ transform: `scale(${zoom})` }}
          >
            {/* Base image */}
            <AuthImage
              src={originalUrl}
              alt="Scan image"
              objectFit="contain"
            />
            {/* Grad-CAM overlay */}
            {mode === 'overlay' && overlayUrl && showOverlay && (
              <div
                className="absolute inset-0"
                style={{ opacity: opacity / 100 }}
              >
                <AuthImage
                  src={overlayUrl}
                  alt="Grad-CAM heatmap"
                  objectFit="contain"
                />
              </div>
            )}
          </div>
        )}

        {/* Loading skeleton overlay */}
        {!loading && !originalUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="w-full h-full rounded-none" />
          </div>
        )}
      </div>

      {/* Opacity slider - only in overlay mode */}
      {!loading && mode === 'overlay' && overlayUrl && showOverlay && (
        <div className="px-4 py-3 bg-slate-900 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 w-24 flex-shrink-0">
              Heatmap opacity
            </span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full appearance-none bg-slate-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 cursor-pointer"
              aria-label="Heatmap overlay opacity"
            />
            <span className="text-xs font-mono text-slate-300 w-8 text-right">
              {opacity}%
            </span>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="px-4 py-2 bg-slate-900 border-t border-slate-800">
        <p className="text-xs text-slate-500">
          Highlighted regions indicate where the model directed its attention.{' '}
          <span className="text-slate-400">AI output is decision-support only.</span>
        </p>
      </div>
    </div>
  );
}
