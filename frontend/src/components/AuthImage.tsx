import { useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface AuthImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  objectFit?: 'contain' | 'cover';
}

export function AuthImage({
  src,
  alt = 'scan image',
  className = '',
  objectFit = 'contain',
}: AuthImageProps) {
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
        if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
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
      if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
    };
  }, []);

  const baseClass = `w-full h-full flex items-center justify-center ${className}`;

  if (status === 'loading') {
    return (
      <div className={baseClass}>
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className={`${baseClass} flex-col gap-2 text-slate-400`}>
        <ImageOff className="w-10 h-10" />
        <span className="text-xs">Image unavailable</span>
      </div>
    );
  }
  if (status === 'loaded' && objectUrl) {
    return (
      <img
        src={objectUrl}
        alt={alt}
        className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
      />
    );
  }
  return (
    <div className={`${baseClass} text-slate-300 text-xs`}>No image</div>
  );
}
