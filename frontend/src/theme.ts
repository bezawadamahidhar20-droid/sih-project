import { createTheme, alpha } from '@mui/material/styles';

// ---------------------------------------------------------------------------
// MediScan AI — Design system (generated with ui-ux-pro-max "Trust & Authority")
// Style: Trust & Authority · WCAG AAA · Light mode
// Typography: Figtree (headings) + Noto Sans (body) — medical, trustworthy
// Motion: subtle micro-interactions only (150–300ms), prefers-reduced-motion safe
// ---------------------------------------------------------------------------

// Calm clinical palette: deep blue/teal primary, white/light-grey surfaces.
// Red is reserved strictly for flagged / low-confidence / critical states.
const palette = {
  primary: {
    main: '#0f5c8c',
    light: '#3d80a8',
    dark: '#0a3f60',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#0f9c8f',
    light: '#4dbcae',
    dark: '#0b6f65',
    contrastText: '#ffffff',
  },
  success: {
    main: '#1d8a5e',
    light: '#e6f5ee',
    dark: '#146643',
  },
  warning: {
    main: '#b7791f',
    light: '#fdf3e2',
    dark: '#8a5a14',
  },
  error: {
    main: '#c0362c',
    light: '#fbeae8',
    dark: '#8f2820',
  },
  info: {
    main: '#2f6fa8',
    light: '#e8f1f9',
    dark: '#1f4d78',
  },
  background: {
    default: '#f4f7f9',
    paper: '#ffffff',
  },
  text: {
    primary: '#0f2430',
    secondary: '#51697a',
  },
  divider: '#e2e9ee',
};

// Elevation tokens — soft, layered shadows instead of flat borders
const shadows = {
  card: '0 1px 2px rgba(15,36,48,0.05), 0 4px 16px -4px rgba(15,36,48,0.08)',
  cardHover: '0 2px 4px rgba(15,36,48,0.06), 0 14px 28px -10px rgba(15,36,48,0.18)',
  pop: '0 4px 12px rgba(15,36,48,0.08), 0 18px 40px -12px rgba(15,36,48,0.22)',
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
    mode: 'light',
    ...palette,
    grey: {
      50: '#f7f9fa',
      100: '#eef2f4',
      200: '#e2e9ee',
      300: '#cbd7de',
      400: '#a7b8c3',
      500: '#84979f',
      600: '#647680',
      700: '#4b5a63',
      800: '#333f47',
      900: '#1b2429',
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
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          fontOpticalSizing: 'auto',
        },
        // Accessible, brand-tinted focus ring for keyboard navigation
        ':focus-visible': {
          outline: `2px solid ${alpha(palette.primary.main, 0.65)}`,
          outlineOffset: 2,
        },
        '::-webkit-scrollbar': { width: 9, height: 9 },
        '::-webkit-scrollbar-track': { background: 'transparent' },
        '::-webkit-scrollbar-thumb': {
          background: '#c3cfd7',
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '::-webkit-scrollbar-thumb:hover': { background: '#a7b8c3', backgroundClip: 'content-box', border: '2px solid transparent' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingTop: 8,
          paddingBottom: 8,
          transition: `background-color ${motion.base} ${motion.ease}, box-shadow ${motion.base} ${motion.ease}, border-color ${motion.base} ${motion.ease}, transform ${motion.base} ${motion.ease}`,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 14px rgba(15,92,140,0.28)',
            transform: 'translateY(-1px)',
          },
          '&:active': { transform: 'translateY(0)' },
        },
        outlined: {
          '&:hover': { borderColor: palette.primary.main, bgcolor: alpha(palette.primary.main, 0.05) },
        },
        text: {
          '&:hover': { bgcolor: alpha(palette.primary.main, 0.06) },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: `background-color ${motion.base} ${motion.ease}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        outlined: {
          borderColor: palette.divider,
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
          border: `1px solid ${palette.divider}`,
          boxShadow: shadows.card,
          transition: `box-shadow ${motion.base} ${motion.ease}, transform ${motion.base} ${motion.ease}, border-color ${motion.base} ${motion.ease}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          transition: `all ${motion.fast} ${motion.ease}`,
        },
        clickable: {
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 2px 8px rgba(15,36,48,0.12)',
          },
        },
      },
    },
    // Note: glass treatment (backdrop-filter + translucent bg) lives in TopBar.tsx,
    // where the material is actually configured — keep a single source of truth.
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: palette.text.secondary,
          backgroundColor: palette.background.default,
        },
        root: {
          borderBottomColor: alpha(palette.divider, 0.8),
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.72rem',
          borderRadius: 8,
          boxShadow: shadows.card,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 14,
          boxShadow: shadows.pop,
          border: `1px solid ${alpha(palette.divider, 0.9)}`,
          padding: 4,
          // Translucent floating material (Apple-style glass)
          backgroundColor: alpha('#ffffff', 0.88),
          backdropFilter: 'blur(14px) saturate(160%)',
          WebkitBackdropFilter: 'blur(14px) saturate(160%)',
          '@media (prefers-reduced-transparency: reduce)': {
            backgroundColor: '#ffffff',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: `background-color ${motion.fast} ${motion.ease}`,
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
          transition: `color ${motion.base} ${motion.ease}`,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          transition: `all ${motion.fast} ${motion.ease}`,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          transition: `box-shadow ${motion.fast} ${motion.ease}`,
          '&.Mui-focused': {
            boxShadow: `0 0 0 3px ${alpha(palette.primary.main, 0.14)}`,
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12 },
        outlined: {
          borderWidth: 1.5,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          transition: `background-color ${motion.base} ${motion.ease}, color ${motion.base} ${motion.ease}`,
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
