import { AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';

interface ConfidenceMeterProps {
  confidence: number;
  probabilities?: Record<string, number>;
  showTable?: boolean;
}

function getLevel(confidence: number) {
  if (confidence < 0.7)
    return {
      label: 'Low Confidence',
      color: '#d97706',
      barColor: '#f59e0b',
      bg: '#fffbeb',
      border: '#fde68a',
      icon: AlertTriangle,
    };
  if (confidence >= 0.9)
    return {
      label: 'High Confidence',
      color: '#059669',
      barColor: '#10b981',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      icon: CheckCircle,
    };
  return {
    label: 'Moderate Confidence',
    color: '#1d4ed8',
    barColor: '#3b82f6',
    bg: '#eff6ff',
    border: '#bfdbfe',
    icon: TrendingUp,
  };
}

export function ConfidenceMeter({
  confidence,
  probabilities,
  showTable = false,
}: ConfidenceMeterProps) {
  const pct = Math.round(confidence * 100);
  const level = getLevel(confidence);
  const Icon = level.icon;

  const lowThreshold = 70;
  const highThreshold = 90;

  return (
    <div className="space-y-4">
      {/* Big confidence display */}
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: level.bg, borderColor: level.border }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5" style={{ color: level.color }} />
            <span className="text-sm font-medium" style={{ color: level.color }}>
              {level.label}
            </span>
          </div>
          <span
            className="text-3xl font-bold font-mono"
            style={{ color: level.color }}
          >
            {pct}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="relative h-3 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              backgroundColor: level.barColor,
            }}
          />
          {/* Threshold markers */}
          <div
            className="absolute top-0 h-full w-px bg-slate-400"
            style={{ left: `${lowThreshold}%` }}
          />
          <div
            className="absolute top-0 h-full w-px bg-slate-400"
            style={{ left: `${highThreshold}%` }}
          />
        </div>

        {/* Scale labels */}
        <div className="flex justify-between mt-1 text-[10px] text-slate-400 font-medium">
          <span>0%</span>
          <span style={{ marginLeft: `${lowThreshold - 8}%` }}>
            {lowThreshold}%
          </span>
          <span style={{ marginLeft: `${highThreshold - lowThreshold - 8}%` }}>
            {highThreshold}%
          </span>
          <span>100%</span>
        </div>
      </div>

      {/* Low confidence warning */}
      {confidence < 0.7 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Clinical review recommended.</p>
          <p className="text-xs mt-0.5 opacity-80">
            Results below 70% confidence should be treated as indeterminate.
          </p>
        </div>
      )}

      {/* Probability table */}
      {showTable && probabilities && Object.keys(probabilities).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Class Probabilities
          </p>
          <div className="space-y-2">
            {Object.entries(probabilities)
              .sort((a, b) => b[1] - a[1])
              .map(([cls, prob]) => {
                const p = Math.round(prob * 100);
                return (
                  <div key={cls} className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 w-24 flex-shrink-0 truncate">
                      {cls}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${p}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-medium text-slate-700 w-8 text-right">
                      {p}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
