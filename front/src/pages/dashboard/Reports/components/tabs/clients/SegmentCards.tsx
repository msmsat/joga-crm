import { useTranslation } from 'react-i18next';
import { Card, Button, InfoHint } from '../../../../../../components/ui/index';
import { fmtInt } from '../../../../../../lib/format';
import { CardHeading } from '../../shared/CardHeading';
import { useScopeNote } from '../../../hooks/useScopeNote';
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
          {t(`clients.segments.${segment.key}.name`)}
        </span>
        <InfoHint title={t(`formulas.segment.${segment.key}.title`)} text={t(`formulas.segment.${segment.key}.text`)} />
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
  const scopeNote = useScopeNote('clientBase');

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <CardHeading title={t('clients.riskTitle')} description={t('descriptions.clients.riskSegments')} formulaKey="riskSegments" scopeNote={scopeNote} />
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))' }}>
          {risk.map(s => (
            <SegmentCard key={s.key} segment={s} onList={() => onList(s.key)} onCampaign={() => onCampaign(s.key)} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <CardHeading title={t('clients.loyalTitle')} description={t('descriptions.clients.loyalSegments')} formulaKey="loyalSegments" scopeNote={scopeNote} />
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
          {loyal.map(s => (
            <SegmentCard key={s.key} segment={s} onList={() => onList(s.key)} />
          ))}
        </div>
      </div>
    </>
  );
}
