import { useTranslation } from 'react-i18next';
import { Card, Button } from '../../../../../../components/ui/index';
import { fmtInt } from '../../../../../../lib/format';
import type { SegmentCount } from '../../../types';

const RISK_ORDER = ['at_risk', 'vip_idle', 'expiring_subscription', 'lost_newcomers', 'upsell_candidates'];
const LOYAL_ORDER = ['frequent', 'high_ltv', 'referrers'];

function bySpecifiedOrder(segments: SegmentCount[], order: string[]): SegmentCount[] {
  const byKey = new Map(segments.map(s => [s.key, s]));
  return order.map(key => byKey.get(key)).filter((s): s is SegmentCount => !!s);
}

function SegmentCard({
  segment, onList, onCampaign,
}: {
  segment: SegmentCount;
  onList: () => void;
  onCampaign?: () => void;
}) {
  const { t } = useTranslation('reports');

  return (
    <Card padding={20}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>
        {t(`clients.segments.${segment.key}.name`)}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '14px', minHeight: '32px' }}>
        {t(`clients.segments.${segment.key}.desc`)}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text)', marginBottom: '14px' }}>
        {fmtInt(segment.count)}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button variant="ghost" size="sm" onClick={onList}>{t('clients.list')}</Button>
        {onCampaign && (
          <Button variant="primary" size="sm" onClick={onCampaign}>{t('clients.campaign')}</Button>
        )}
      </div>
    </Card>
  );
}

export interface SegmentCardsProps {
  riskSegments: SegmentCount[];
  loyalSegments: SegmentCount[];
  onList: (key: string) => void;
  onCampaign: (key: string) => void;
}

export function SegmentCards({ riskSegments, loyalSegments, onList, onCampaign }: SegmentCardsProps) {
  const { t } = useTranslation('reports');
  const risk = bySpecifiedOrder(riskSegments, RISK_ORDER);
  const loyal = bySpecifiedOrder(loyalSegments, LOYAL_ORDER);

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: '0 0 12px', letterSpacing: '-0.2px' }}>
          {t('clients.riskTitle')}
        </h3>
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {risk.map(s => (
            <SegmentCard key={s.key} segment={s} onList={() => onList(s.key)} onCampaign={() => onCampaign(s.key)} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: '0 0 12px', letterSpacing: '-0.2px' }}>
          {t('clients.loyalTitle')}
        </h3>
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {loyal.map(s => (
            <SegmentCard key={s.key} segment={s} onList={() => onList(s.key)} />
          ))}
        </div>
      </div>
    </>
  );
}
