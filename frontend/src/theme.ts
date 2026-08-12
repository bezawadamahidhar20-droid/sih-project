import { createTheme, alpha } from '@mui/material/styles';

// ---------------------------------------------------------------------------
// MediScan AI — Surgical Slate & Electric Cyan Design System
// Style: High-Precision Clinical Workstation · Ultra-Clean Dark Mode
// ---------------------------------------------------------------------------

export const tokens = {
  // Primary Palette
  bgDark: '#070C12',
  surfaceDark: '#0D1520',
  surfaceBorder: 'rgba(255, 255, 255, 0.08)',
  
  // Accents
  cyan: '#00B4D8',
  cyanLight: '#48CAE4',
  cyanDark: '#0077B6',
  
  // Clinical Telemetry Status Colors
  confidenceHigh: '#10B981', // Emerald Green
  confidenceLow: '#F59E0B',  // Amber Gold
  critical: '#EF4444',        // Crimson Red
  
  // Neutral Typography
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
};

const shadows = [
  'none',
  '0 1px 2px rgba(0, 0, 0, 0.4)',
  '0 2px 6px rgba(0, 0, 0, 0.45)',
  '0 4px 14px rgba(0, 0, 0, 0.5)',
  '0 8px 24px rgba(0, 0, 0, 0.55), 0 0 16px rgba(0, 180, 216, 0.08)',
  ...Array(20).fill('0 12px 32px rgba(0, 0, 0, 0.6), 0 0 24px rgba(0, 180, 216, 0.12)'),
];

export function buildTheme(mode: 'light' | 'dark' = 'dark') {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: tokens.cyan,
        light: tokens.cyanLight,
        dark: tokens.cyanDark,
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: tokens.cyanDark,
        light: tokens.cyan,
        dark: '#03045E',
        contrastText: '#FFFFFF',
      },
      success: {
        main: tokens.confidenceHigh,
        light: alpha(tokens.confidenceHigh, 0.16),
        dark: '#059669',
      },
      warning: {
        main: tokens.confidenceLow,
        light: alpha(tokens.confidenceLow, 0.16),
        dark: '#D97706',
      },
      error: {
        main: tokens.critical,
        light: alpha(tokens.critical, 0.16),
        dark: '#DC2626',
      },
      background: {
        default: isDark ? tokens.bgDark : '#F8FAFC',
        paper: isDark ? tokens.surfaceDark : '#FFFFFF',
      },
      text: {
        primary: isDark ? tokens.textPrimary : '#0F172A',
        secondary: isDark ? tokens.textSecondary : '#475569',
      },
      divider: isDark ? tokens.surfaceBorder : 'rgba(15, 23, 42, 0.08)',
    },

    shape: {
      borderRadius: 12,
    },

    typography: {
      fontFamily: '"Inter", "Space Grotesk", sans-serif',
      h1: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        fontSize: '2.25rem',
        lineHeight: 1.15,
        letterSpacing: '-0.03em',
      },
      h2: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        fontSize: '1.75rem',
        lineHeight: 1.2,
        letterSpacing: '-0.025em',
      },
      h3: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        fontSize: '1.35rem',
        lineHeight: 1.3,
        letterSpacing: '-0.018em',
      },
      h4: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 600,
        fontSize: '1.15rem',
        lineHeight: 1.35,
      },
      h5: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 600,
        fontSize: '1.05rem',
        lineHeight: 1.4,
      },
      h6: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 600,
        fontSize: '0.95rem',
        lineHeight: 1.45,
      },
      subtitle1: { fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.55 },
      subtitle2: { fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.55 },
      body1: { fontFamily: '"Inter", sans-serif', fontSize: '0.925rem', lineHeight: 1.7 },
      body2: { fontFamily: '"Inter", sans-serif', fontSize: '0.825rem', lineHeight: 1.65 },
      button: { fontWeight: 600, textTransform: 'none' as const },
      caption: { fontSize: '0.75rem', lineHeight: 1.5 },
      overline: { fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em' },
    },

    shadows: shadows as any,

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: isDark ? tokens.bgDark : '#F8FAFC',
            backgroundImage: isDark
              ? 'radial-gradient(1000px 700px at 85% -10%, rgba(0, 180, 216, 0.10) 0%, transparent 70%),' +
                'radial-gradient(800px 600px at -10% 110%, rgba(16, 185, 129, 0.08) 0%, transparent 70%)'
              : 'none',
            backgroundAttachment: 'fixed',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
          ':focus-visible': {
            outline: `2px solid ${tokens.cyan}`,
            outlineOffset: 2,
          },
          '::-webkit-scrollbar': { width: 6, height: 6 },
          '::-webkit-scrollbar-track': { background: 'rgba(0,0,0,0.1)' },
          '::-webkit-scrollbar-thumb': {
            background: 'rgba(0, 180, 216, 0.25)',
            borderRadius: 8,
          },
          '::-webkit-scrollbar-thumb:hover': {
            background: 'rgba(0, 180, 216, 0.45)',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 10,
            paddingTop: 8,
            paddingBottom: 8,
            transition: 'all 160ms ease',
            '&:active': { transform: 'scale(0.97)' },
          },
          contained: {
            backgroundColor: tokens.cyan,
            color: '#070C12',
            fontWeight: 700,
            '&:hover': {
              backgroundColor: tokens.cyanLight,
              boxShadow: '0 6px 20px rgba(0, 180, 216, 0.3)',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            border: `1px solid ${isDark ? tokens.surfaceBorder : 'rgba(15, 23, 42, 0.08)'}`,
            background: isDark ? 'rgba(13, 21, 32, 0.75)' : '#FFFFFF',
            backdropFilter: isDark ? 'blur(20px) saturate(160%)' : 'none',
            transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
            '&:hover': {
              borderColor: alpha(tokens.cyan, 0.35),
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontFamily: '"IBM Plex Mono", monospace',
            fontWeight: 600,
            borderRadius: 8,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: 'rgba(7, 12, 18, 0.6)',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.surfaceBorder,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(tokens.cyan, 0.5),
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.cyan,
              borderWidth: 2,
            },
          },
        },
      },
    },
  });
}

export const theme = buildTheme('dark');

export const confidenceColor = (confidence: number) => {
  const score = confidence <= 1 ? confidence : confidence / 100;
  if (score >= 0.7) return tokens.confidenceHigh;
  if (score >= 0.4) return tokens.confidenceLow;
  return tokens.critical;
};

export const confidenceSoftColor = (confidence: number) => {
  const score = confidence <= 1 ? confidence : confidence / 100;
  if (score >= 0.7) return alpha(tokens.confidenceHigh, 0.14);
  if (score >= 0.4) return alpha(tokens.confidenceLow, 0.14);
  return alpha(tokens.critical, 0.14);
};

export default theme;
