import { createTheme, alpha } from '@mui/material/styles';

// ---------------------------------------------------------------------------
// MediScan AI — Design system — DARK mode (matches login page aesthetic)
// Style: Deep Navy Glass · Premium Medical · WCAG AA
// ---------------------------------------------------------------------------

// Deep navy dark palette with glowing blue/teal accents
const palette = {
  primary: {
    main: '#3d80a8',
    light: '#6fb3e0',
    dark: '#0f5c8c',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#0f9c8f',
    light: '#4dbcae',
    dark: '#0b6f65',
    contrastText: '#ffffff',
  },
  success: {
    main: '#3ddc84',
    light: '#1e3d2a',
    dark: '#27a85f',
    contrastText: '#ffffff',
  },
  warning: {
    main: '#f0b429',
    light: '#3a2f0f',
    dark: '#b7791f',
    contrastText: '#ffffff',
  },
  error: {
    main: '#e05c5c',
    light: '#3a1414',
    dark: '#c0362c',
    contrastText: '#ffffff',
  },
  info: {
    main: '#6fb3e0',
    light: '#0d2540',
    dark: '#2f6fa8',
    contrastText: '#ffffff',
  },
  background: {
    default: '#070f18',
    paper: '#0d1f30',
  },
  text: {
    primary: '#e8f0f6',
    secondary: '#8fa8be',
  },
  divider: 'rgba(255,255,255,0.1)',
};

// Elevation tokens — glowing dark shadows
const shadows = {
  card: '0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
  cardHover: '0 8px 24px rgba(0,0,0,0.5), 0 0 20px rgba(61,128,168,0.18)',
  pop: '0 16px 48px rgba(0,0,0,0.6), 0 0 30px rgba(61,128,168,0.15)',
};

// Motion tokens — subtle, deliberate, reduced-motion friendly
const motion = {
  fast: '150ms',
  base: '200ms',
  slow: '300ms',
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

export const theme = createTheme({
  palette: {
    mode: 'dark',
    ...palette,
    grey: {
      50: '#0d1f30',
      100: '#122333',
      200: '#1a3048',
      300: '#254260',
      400: '#3a5e80',
      500: '#567898',
      600: '#7096b4',
      700: '#94b4cc',
      800: '#b8d0e0',
      900: '#dceaf5',
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    // Heading + body pairing from ui-ux-pro-max (Trust & Authority)
    fontFamily: [
      '"Noto Sans"',
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      'Helvetica',
      'Arial',
      'sans-serif',
    ].join(','),
    // Apple-style type discipline: leading tightens as size grows, tracking goes
    // negative on display sizes and stays near 0 for body text.
    h1: {
      fontFamily: 'Figtree, "Noto Sans", Inter, sans-serif',
      fontWeight: 700,
      fontSize: '2.125rem',
      lineHeight: 1.15,
      letterSpacing: '-0.03em',
      fontOpticalSizing: 'auto',
    },
    h2: {
      fontFamily: 'Figtree, "Noto Sans", Inter, sans-serif',
      fontWeight: 700,
      fontSize: '1.75rem',
      lineHeight: 1.2,
      letterSpacing: '-0.025em',
      fontOpticalSizing: 'auto',
    },
    h3: {
      fontFamily: 'Figtree, "Noto Sans", Inter, sans-serif',
      fontWeight: 700,
      fontSize: '1.375rem',
      lineHeight: 1.3,
      letterSpacing: '-0.018em',
      fontOpticalSizing: 'auto',
    },
    h4: {
      fontFamily: 'Figtree, "Noto Sans", Inter, sans-serif',
      fontWeight: 700,
      fontSize: '1.15rem',
      lineHeight: 1.35,
      letterSpacing: '-0.01em',
    },
    h5: {
      fontFamily: 'Figtree, "Noto Sans", Inter, sans-serif',
      fontWeight: 700,
      fontSize: '1.05rem',
      lineHeight: 1.4,
    },
    h6: {
      fontFamily: 'Figtree, "Noto Sans", Inter, sans-serif',
      fontWeight: 600,
      fontSize: '0.95rem',
      lineHeight: 1.45,
    },
    subtitle1: { fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.55, letterSpacing: '0.005em' },
    subtitle2: { fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.55, color: palette.text.secondary, letterSpacing: '0.01em' },
    body1: { fontSize: '0.925rem', lineHeight: 1.7, letterSpacing: '0.002em' },
    body2: { fontSize: '0.825rem', lineHeight: 1.65, letterSpacing: '0.004em' },
    button: { fontWeight: 600, textTransform: 'none' as const, letterSpacing: '0.01em' },
    caption: { fontSize: '0.75rem', lineHeight: 1.55, letterSpacing: '0.01em' },
    overline: { fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em' },
  },
  spacing: 8,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: palette.background.default,
          backgroundImage:
            'radial-gradient(900px 600px at 80% -10%, rgba(15,92,140,0.18) 0%, transparent 70%),' +
            'radial-gradient(700px 500px at -10% 110%, rgba(15,156,143,0.12) 0%, transparent 70%),' +
            'radial-gradient(600px 400px at 50% 50%, rgba(61,128,168,0.06) 0%, transparent 70%)',
          backgroundAttachment: 'fixed',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          fontOpticalSizing: 'auto',
        },
        ':focus-visible': {
          outline: `2px solid ${alpha(palette.primary.main, 0.8)}`,
          outlineOffset: 2,
        },
        '::-webkit-scrollbar': { width: 7, height: 7 },
        '::-webkit-scrollbar-track': { background: 'rgba(255,255,255,0.03)' },
        '::-webkit-scrollbar-thumb': {
          background: 'rgba(111,179,224,0.2)',
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(111,179,224,0.4)',
          backgroundClip: 'content-box',
          border: '2px solid transparent',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingTop: 8,
          paddingBottom: 8,
          fontWeight: 600,
          letterSpacing: '0.01em',
          transition: `background-color 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1), border-color 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1)`,
          '&:active': {
            transform: 'scale(0.97)',
          },
        },
        contained: {
          boxShadow: '0 2px 8px rgba(15, 92, 140, 0.18)',
          '&:hover': {
            boxShadow: '0 6px 20px rgba(15, 92, 140, 0.32)',
            transform: 'translateY(-1.5px)',
          },
          '&:active': { transform: 'scale(0.97) translateY(0)' },
        },
        outlined: {
          borderWidth: '1px',
          borderColor: alpha(palette.primary.main, 0.35),
          '&:hover': { borderColor: palette.primary.main, bgcolor: alpha(palette.primary.main, 0.06), transform: 'translateY(-1px)' },
          '&:active': { transform: 'scale(0.97) translateY(0)' },
        },
        text: {
          '&:hover': { bgcolor: alpha(palette.primary.main, 0.08), transform: 'translateY(-1px)' },
          '&:active': { transform: 'scale(0.97) translateY(0)' },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: `background-color 180ms ease, transform 150ms cubic-bezier(0.16, 1, 0.3, 1)`,
          '&:active': {
            transform: 'scale(0.92)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 14,
          backgroundColor: 'rgba(13,31,48,0.85)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.08)',
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.12)',
        },
        elevation1: { boxShadow: shadows.card },
        elevation2: { boxShadow: shadows.card },
        elevation3: { boxShadow: shadows.cardHover },
        elevation4: { boxShadow: shadows.cardHover },
        elevation8: { boxShadow: shadows.pop },
        elevation16: { boxShadow: shadows.pop },
        elevation24: { boxShadow: shadows.pop },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid rgba(111,179,224,0.12)',
          background: 'rgba(11,31,50,0.7)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          boxShadow: shadows.card,
          transition: `box-shadow 250ms cubic-bezier(0.16, 1, 0.3, 1), transform 250ms cubic-bezier(0.16, 1, 0.3, 1), border-color 250ms cubic-bezier(0.16, 1, 0.3, 1)`,
          '&:hover': {
            boxShadow: shadows.cardHover,
            borderColor: 'rgba(111,179,224,0.3)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 8,
          transition: `all 180ms cubic-bezier(0.16, 1, 0.3, 1)`,
        },
        clickable: {
          '&:hover': {
            transform: 'translateY(-1px) scale(1.02)',
            boxShadow: '0 3px 10px rgba(15,36,48,0.12)',
          },
          '&:active': {
            transform: 'scale(0.96)',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.75rem',
          fontWeight: 500,
          borderRadius: 8,
          boxShadow: shadows.pop,
          backgroundColor: alpha('#0b2338', 0.92),
          backdropFilter: 'blur(10px)',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 14,
          boxShadow: shadows.pop,
          border: '1px solid rgba(111,179,224,0.2)',
          padding: 6,
          backgroundColor: 'rgba(8,20,35,0.95)',
          backdropFilter: 'blur(24px) saturate(170%)',
          WebkitBackdropFilter: 'blur(24px) saturate(170%)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
          transition: `background-color 150ms ease, transform 150ms cubic-bezier(0.16, 1, 0.3, 1)`,
          '&:active': {
            transform: 'scale(0.98)',
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 8, height: 8 },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: '3px 3px 0 0',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          transition: `color 200ms ease, transform 150ms ease`,
          '&:active': { transform: 'scale(0.97)' },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
          transition: `all 180ms cubic-bezier(0.16, 1, 0.3, 1)`,
          '&:active': { transform: 'scale(0.96)' },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          transition: `box-shadow 180ms ease, border-color 180ms ease`,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255,255,255,0.15)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.primary.light,
          },
          '&.Mui-focused': {
            boxShadow: `0 0 0 3px ${alpha(palette.primary.light, 0.25)}`,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: palette.text.secondary,
          backgroundColor: 'rgba(7,15,24,0.6)',
          backdropFilter: 'blur(10px)',
        },
        root: {
          borderBottomColor: 'rgba(255,255,255,0.06)',
        },
      },
    },
  },
});

export const confidenceColor = (confidence: number) => {
  const pct = confidence <= 1 ? confidence * 100 : confidence;
  if (pct >= 85) return theme.palette.success.main;
  if (pct >= 70) return theme.palette.warning.main;
  return theme.palette.error.main;
};

export const confidenceSoftColor = (confidence: number) => {
  const pct = confidence <= 1 ? confidence * 100 : confidence;
  if (pct >= 85) return alpha(theme.palette.success.main, 0.12);
  if (pct >= 70) return alpha(theme.palette.warning.main, 0.12);
  return alpha(theme.palette.error.main, 0.12);
};

export default theme;
