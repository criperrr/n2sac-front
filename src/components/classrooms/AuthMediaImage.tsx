import React, { useEffect, useState } from 'react';
import { fetchAuthenticatedMediaUrl } from '../../api/nsacClient';

export const AuthMediaImage: React.FC<{
  token: string;
  src: string | null | undefined;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
  fallback?: React.ReactNode;
}> = ({ token, src, alt, style, className, onClick, fallback = null }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    void fetchAuthenticatedMediaUrl(token, src).then((url) => {
      if (!cancelled) setBlobUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [token, src]);

  if (!src || !blobUrl) return <>{fallback}</>;

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      loading="lazy"
    />
  );
};
