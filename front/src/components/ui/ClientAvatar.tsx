import type { CSSProperties } from 'react';
import { useMediaSources } from './useMediaSources';

export function ClientAvatar({ url, initials, className, style }: {
  url?: string | null; initials: string; className?: string; style?: CSSProperties;
}) {
  const { ref: avatarRef, sources } = useMediaSources(url ? [url] : []);
  const src = url ? sources.get(url) : null;
  return <div ref={avatarRef} className={className} style={{ overflow: 'hidden', flexShrink: 0, ...style }}>
    {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/> : initials}
  </div>;
}
