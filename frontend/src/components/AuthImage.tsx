import { useEffect, useRef, useState } from 'react'
import { Box, CircularProgress } from '@mui/material'
import { ImageNotSupportedOutlined } from '@mui/icons-material'
import { api } from '../services/api'

interface AuthImageProps {
  src?: string | null
  alt?: string
  aspectRatio?: string
  objectFit?: 'contain' | 'cover'
}

/**
 * Renders an image served by the authenticated backend.
 * A plain <img> cannot attach the JWT, so the bytes are fetched through the
 * axios client and displayed as an object URL (revoked on cleanup).
 */
export function AuthImage({
  src,
  alt = 'scan image',
  aspectRatio = '4 / 3',
  objectFit = 'contain',
}: AuthImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const revokeRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!src) {
      setObjectUrl(null)
      setStatus('idle')
      return
    }

    setStatus('loading')
    api
      .fetchImageBlob(src)
      .then((url) => {
        if (cancelled) return
        if (revokeRef.current) URL.revokeObjectURL(revokeRef.current)
        revokeRef.current = url
        setObjectUrl(url)
        setStatus('loaded')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [src])

  useEffect(() => {
    return () => {
      if (revokeRef.current) URL.revokeObjectURL(revokeRef.current)
    }
  }, [])

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio,
        backgroundColor: '#10161D',
        borderRadius: 1,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {status === 'loading' && (
        <CircularProgress size={28} sx={{ color: '#7FA3C4' }} />
      )}
      {status === 'error' && (
        <Box sx={{ textAlign: 'center', color: '#8FA3B5', p: 2 }}>
          <ImageNotSupportedOutlined sx={{ fontSize: 40, mb: 1 }} />
          <Box sx={{ fontSize: '0.75rem' }}>Image unavailable</Box>
        </Box>
      )}
      {status === 'loaded' && objectUrl && (
        <img
          src={objectUrl}
          alt={alt}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit,
          }}
        />
      )}
      {status === 'idle' && (
        <Box sx={{ color: '#8FA3B5', fontSize: '0.75rem' }}>No image</Box>
      )}
    </Box>
  )
}
