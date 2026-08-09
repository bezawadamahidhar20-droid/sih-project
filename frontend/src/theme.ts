import { createTheme, ThemeOptions, Shadows } from '@mui/material/styles'

/**
 * MediScan AI — clinical design system.
 *
 * Principles (from the product brief):
 *  - Low noise: generous whitespace, hairline borders instead of shadows.
 *  - Cool, restrained palette; ONE accent (amber) reserved for critical
 *    states (low-confidence warnings) — never used decoratively.
 *  - Sharp, precise geometry: small radii, no gradients, no "bubbly" cards.
 *  - High contrast text (WCAG AA) with icons + labels so color is never the
 *    only signal (colorblind-safe).
 */

const palette = {
  mode: 'light' as const,
  primary: {
    main: '#12507E', // deep clinical blue
    light: '#3A74A6',
    dark: '#0B3A5E',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#27606B', // muted teal
    light: '#4C8791',
    dark: '#1A4650',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#B3261E',
    light: '#D25B54',
    dark: '#7F1B15',
    contrastText: '#FFFFFF',
  },
  warning: {
    main: '#9A6700', // dark amber — the reserved accent
    light: '#C48A2E',
    dark: '#6B4700',
    contrastText: '#FFFFFF',
  },
  success: {
    main: '#1E7B45',
    light: '#3E9A64',
    dark: '#14572F',
    contrastText: '#FFFFFF',
  },
  info: {
    main: '#12507E',
    light: '#EAF2FA',
    dark: '#0B3A5E',
    contrastText: '#FFFFFF',
  },
  background: {
    default: '#F4F6F8', // cool gray canvas
    paper: '#FFFFFF',
  },
  text: {
    primary: '#1B2430',
    secondary: '#4C5A68',
    disabled: '#97A1AC',
  },
  divider: '#DCE1E7',
}

const themeOptions: ThemeOptions = {
  palette,
  typography: {
    fontFamily: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: '2rem', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em' },
    h2: { fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.01em' },
    h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3 },
    h4: { fontSize: '1.3125rem', fontWeight: 600, lineHeight: 1.35 },
    h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
    subtitle1: { fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.5 },
    subtitle2: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.6 },
    caption: { fontSize: '0.75rem', lineHeight: 1.5, letterSpacing: '0.01em' },
    overline: {
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      lineHeight: 1.5,
    },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  shape: { borderRadius: 6 },
  shadows: [
    'none',
    '0 0 0 1px rgba(27,36,48,0.05), 0 1px 2px rgba(27,36,48,0.04)',
    '0 0 0 1px rgba(27,36,48,0.05), 0 2px 4px rgba(27,36,48,0.05)',
    '0 0 0 1px rgba(27,36,48,0.06), 0 4px 8px rgba(27,36,48,0.06)',
    '0 0 0 1px rgba(27,36,48,0.06), 0 6px 12px rgba(27,36,48,0.07)',
    ...Array(20).fill('none'),
  ] as Shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: palette.background.default },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6, padding: '7px 14px', fontSize: '0.875rem' },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 0 0 1px rgba(27,36,48,0.08), 0 2px 4px rgba(27,36,48,0.06)' },
          '&:focus-visible': { outline: '2px solid #12507E', outlineOffset: 2 },
        },
        outlined: { borderColor: '#C6CED6' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          border: '1px solid #DCE1E7',
          borderRadius: 6,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: '#DCE1E7' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          borderBottom: '1px solid #DCE1E7',
          backgroundImage: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: '1px solid #DCE1E7' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#8FA3B5' },
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#F4F6F8',
          '& .MuiTableCell-head': {
            fontWeight: 600,
            color: '#4C5A68',
            fontSize: '0.75rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            borderBottom: '1px solid #DCE1E7',
            whiteSpace: 'nowrap',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: '#F7F9FB' },
          '&:last-child td': { borderBottom: 'none' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: '1px solid #EDF0F3', fontSize: '0.875rem' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 },
        outlined: { borderColor: '#C6CED6' },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 6 } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 2, backgroundColor: '#E3E8ED' },
        bar: { borderRadius: 2 },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: '#12507E' },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: 'none',
          fontWeight: 500,
          borderColor: '#C6CED6',
          '&.Mui-selected': {
            backgroundColor: '#12507E',
            color: '#FFFFFF',
            '&:hover': { backgroundColor: '#0B3A5E' },
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: { root: { color: '#12507E' } },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { fontSize: '0.75rem' } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 8 } },
    },
  },
}

export const theme = createTheme(themeOptions)
