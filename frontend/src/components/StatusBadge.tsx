import { ScanStatus } from '../types';

interface StatusBadgeProps {
  status: ScanStatus | string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  uploaded: {
    label: 'Uploaded',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
  processing: {
    label: 'Processing',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500 animate-pulse',
  },
  completed: {
    label: 'Analyzed',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
  flagged: {
    label: 'Flagged',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  'needs-review': {
    label: 'Needs Review',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  };

  const sizeClass =
    size === 'sm'
      ? 'text-xs px-2 py-0.5'
      : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border font-medium ${config.className} ${sizeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
}

interface FindingBadgeProps {
  predictedClass: string;
  size?: 'sm' | 'md';
}

export function FindingBadge({ predictedClass, size = 'sm' }: FindingBadgeProps) {
  const isNormal = predictedClass === 'Normal';
  const sizeClass =
    size === 'sm'
      ? 'text-xs px-2 py-0.5'
      : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border font-medium ${sizeClass} ${
        isNormal
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-red-50 text-red-700 border-red-200'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          isNormal ? 'bg-emerald-500' : 'bg-red-500'
        }`}
      />
      {predictedClass}
    </span>
  );
}

interface ConfidenceBadgeProps {
  confidence: number;
  size?: 'sm' | 'md';
}

export function ConfidenceBadge({ confidence, size = 'sm' }: ConfidenceBadgeProps) {
  const pct = Math.round(confidence * 100);
  const sizeClass =
    size === 'sm'
      ? 'text-xs px-2 py-0.5'
      : 'text-sm px-2.5 py-1';

  let className = '';
  if (pct >= 90) className = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  else if (pct >= 70) className = 'bg-blue-50 text-blue-700 border-blue-200';
  else className = 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <span className={`inline-flex items-center rounded border font-mono font-medium ${className} ${sizeClass}`}>
      {pct}%
    </span>
  );
}
