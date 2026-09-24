import type { StudioService } from '../../api/studio';

/** The server only supplies a comparison price when every bundle price is lower. */
export function BundleSummary({ service }: { service?: Pick<StudioService, 'bundle_parts' | 'bundle_full_price_str'> | null }) {
  if (!service?.bundle_parts?.length) return null;
  return <span className="mt-1 block break-words text-[12px] font-medium text-muted-foreground">
    <span className="block">{service.bundle_parts.join(' · ')}</span>
    {service.bundle_full_price_str && <del className="block tabular-nums">{service.bundle_full_price_str}</del>}
  </span>;
}
