import { createTheme, alpha } from '@mui/material/styles';

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
    borderRadius: 10,
  },
  typography: {
    fontFamily: [
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      'Helvetica',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: { fontWeight: 700, fontSize: '2.25rem', letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, fontSize: '1.875rem', letterSpacing: '-0.02em' },
    h3: { fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.01em' },
    h4: { fontWeight: 700, fontSize: '1.25rem' },
    h5: { fontWeight: 700, fontSize: '1.1rem' },
    h6: { fontWeight: 600, fontSize: '1rem' },
    subtitle1: { fontWeight: 600, fontSize: '0.95rem' },
    subtitle2: { fontWeight: 600, fontSize: '0.8rem', color: palette.text.secondary },
    body1: { fontSize: '0.925rem' },
    body2: { fontSize: '0.825rem' },
    button: { fontWeight: 600, textTransform: 'none' as const },
    caption: { fontSize: '0.75rem' },
    overline: { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em' },
  },
  spacing: 8,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: palette.background.default,
        },
        '::-webkit-scrollbar': { width: 8, height: 8 },
        '::-webkit-scrollbar-track': { background: 'transparent' },
        '::-webkit-scrollbar-thumb': {
          background: palette.background.paper === '#ffffff' ? '#c7d2d9' : '#333',
          borderRadius: 8,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, paddingTop: 8, paddingBottom: 8 },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 4px 14px rgba(15,92,140,0.25)' },
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
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${palette.divider}`,
          boxShadow: '0 1px 2px rgba(15,36,48,0.04)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          borderBottom: `1px solid ${palette.divider}`,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: palette.text.secondary,
          backgroundColor: palette.background.default,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.72rem',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 8, height: 8 },
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
