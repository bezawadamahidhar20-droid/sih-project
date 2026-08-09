import { AlertTriangle, CheckCircle, Flag, AlertOctagon, Info } from 'lucide-react';

type BannerVariant = 'normal' | 'low-confidence' | 'flagged' | 'critical' | 'info';

interface ClinicalSafetyBannerProps {
  variant: BannerVariant;
  message?: string;
  subMessage?: string;
}

const variantConfig = {
  normal: {
    icon: CheckCircle,
    title: 'AI result available for clinical review.',
    className: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    iconClass: 'text-emerald-600',
  },
  'low-confidence': {
    icon: AlertTriangle,
    title: 'AI confidence is below the configured threshold.',
    className: 'bg-amber-50 border-amber-200 text-amber-800',
    iconClass: 'text-amber-600',
  },
  flagged: {
    icon: Flag,
    title: 'This result has been flagged for additional review.',
    className: 'bg-blue-50 border-blue-200 text-blue-800',
    iconClass: 'text-blue-600',
  },
  critical: {
    icon: AlertOctagon,
    title: 'High-priority finding requires clinical attention.',
    className: 'bg-red-50 border-red-200 text-red-800',
    iconClass: 'text-red-600',
  },
  info: {
    icon: Info,
    title: 'AI output is decision-support only and does not constitute a final diagnosis.',
    className: 'bg-blue-50 border-blue-200 text-blue-800',
    iconClass: 'text-blue-600',
  },
};

export function ClinicalSafetyBanner({
  variant,
  message,
  subMessage,
}: ClinicalSafetyBannerProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${config.className}`}
      role="alert"
    >
      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconClass}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{message ?? config.title}</p>
        {subMessage && (
          <p className="text-xs mt-0.5 opacity-80">{subMessage}</p>
        )}
      </div>
    </div>
  );
}
