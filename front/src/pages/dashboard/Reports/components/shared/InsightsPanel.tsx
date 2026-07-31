import { useTranslation } from 'react-i18next';
import { Card } from '../../../../../components/ui/index';
import { useInsightAction } from '../../hooks/useInsightAction';
import type { Insight } from '../../types';

export interface InsightsPanelProps {
  insights: Insight[];
  variant?: 'side' | 'full'; // side — колонка рядом с главным графиком, full — текущая горизонтальная раскладка
}

const SEVERITY_COLOR: Record<Insight['severity'], string> = {
  info: '#4A80C4',
  warning: '#F9A08B',
  critical: '#D88C9A',
};

export function InsightsPanel({ insights, variant = 'full' }: InsightsPanelProps) {
  const { t } = useTranslation('reports');
  const runAction = useInsightAction();
  const side = variant === 'side';

  if (insights.length === 0) {
    return (
      <Card padding={24} style={side ? { position: 'sticky', top: '16px' } : undefined}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: '0 0 14px', letterSpacing: '-0.2px' }}>
          {t('insights.title')}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#A3C9A8', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('insights.empty')}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card padding={24} style={side ? { position: 'sticky', top: '16px' } : undefined}>
      <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: '0 0 14px', letterSpacing: '-0.2px' }}>
        {t('insights.title')}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {insights.slice(0, 4).map((insight, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: side ? 'column' : 'row',
            alignItems: side ? 'stretch' : 'center',
            justifyContent: side ? 'flex-start' : 'space-between',
            gap: side ? '10px' : '12px',
            padding: '10px 12px', borderRadius: '10px', background: 'rgba(var(--ink),0.025)',
          }}>
            <div style={{ display: 'flex', alignItems: side ? 'flex-start' : 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: SEVERITY_COLOR[insight.severity], flexShrink: 0, marginTop: side ? '5px' : 0 }} />
              <span
                title={side ? (t(`insights.${insight.key}`, insight.params) as string) : undefined}
                style={side ? {
                  fontSize: '13px', color: 'var(--text)', whiteSpace: 'normal',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                } : {
                  fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {t(`insights.${insight.key}`, insight.params)}
              </span>
            </div>
            <button
              onClick={() => runAction(insight.action, insight.action_params)}
              style={{
                padding: '5px 12px', borderRadius: '8px', border: 'none', flexShrink: 0,
                background: 'rgba(249,160,139,0.14)', color: '#C07060',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                width: side ? '100%' : undefined,
              }}
            >
              {t('insights.action')}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
