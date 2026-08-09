import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import BrokenImageRoundedIcon from '@mui/icons-material/BrokenImageRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import { api } from '../../services/api';

interface AuthImageProps {
  src?: string | null;
  alt?: string;
  objectFit?: 'contain' | 'cover';
  sx?: object;
}

export function AuthImage({ src, alt = 'scan image', objectFit = 'contain', sx }: AuthImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const revokeRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      setObjectUrl(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    api
      .fetchImageBlob(src)
      .then((url) => {
        if (cancelled) return;
        if (revokeRef.current && revokeRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(revokeRef.current);
        }
        revokeRef.current = url;
        setObjectUrl(url);
        setStatus('loaded');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    return () => {
      if (revokeRef.current && revokeRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(revokeRef.current);
      }
    };
  }, []);

  const baseSx = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...sx,
  };

  if (status === 'loading') {
    return (
      <Box sx={baseSx}>
        <CircularProgress size={28} thickness={4} />
      </Box>
    );
  }
  if (status === 'error') {
    return (
      <Box sx={{ ...baseSx, flexDirection: 'column', gap: 1, color: 'grey.500' }}>
        <BrokenImageRoundedIcon sx={{ fontSize: 30 }} />
        <Typography variant="caption">Image unavailable</Typography>
      </Box>
    );
  }
  if (status === 'loaded' && objectUrl) {
    return (
      <Box sx={baseSx}>
        <Box
          component="img"
          src={objectUrl}
          alt={alt}
          sx={{ width: '100%', height: '100%', objectFit, userSelect: 'none' }}
          draggable={false}
        />
      </Box>
    );
  }
  return (
    <Box sx={{ ...baseSx, flexDirection: 'column', gap: 1, color: 'grey.500' }}>
      <ImageRoundedIcon sx={{ fontSize: 30 }} />
      <Typography variant="caption">No image</Typography>
    </Box>
  );
}
