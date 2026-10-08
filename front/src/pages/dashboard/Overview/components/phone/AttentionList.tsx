import { useTranslation } from 'react-i18next';
import type { Insight } from '../../../../../api/analytics/analytics.types';
import { useInsightAction } from '../../../Reports/hooks/useInsightAction';
import SectionHead from './SectionHead';
import { CheckCircle, ChevronRight, SignalIcon } from './icons';
import s from './PhoneLists.module.css';

interface Props {
  insights: Insight[];
  /** Пока ответ едет, «всё спокойно» было бы неправдой — держим место заглушками. */
  loading: boolean;
}

/**
 * «Требует внимания»: подсказки, которые сервер уже посчитал для Отчётов
 * (GET /analytics/overview), — те же тексты и те же переходы. Строка целиком —
 * кнопка: на телефоне отдельная мелкая «Открыть» только мешала бы пальцу.
 */
export default function AttentionList({ insights, loading }: Props) {
  const { t } = useTranslation('dashboard');
  const runAction = useInsightAction();

  return (
    <section className={s.section}>
      <SectionHead title={t('reports:insights.title')} />
      <div className={s.card}>
        {loading ? (
          <div className={s.skelList}>
            <span className={s.rowSkel} />
            <span className={s.rowSkel} />
          </div>
        ) : insights.length === 0 ? (
          <div className={s.calm}>
            <span className={s.calmIcon}><CheckCircle /></span>
            {t('reports:insights.empty')}
          </div>
        ) : (
          insights.map((insight, i) => (
            <button
              key={`${insight.key}-${i}`}
              type="button"
              className={s.signal}
              data-severity={insight.severity}
              onClick={() => runAction(insight.action, insight.action_params)}
            >
              <span className={s.signalIcon}><SignalIcon severity={insight.severity} /></span>
              <span className={s.signalText}>{t(`reports:insights.${insight.key}`, insight.params)}</span>
              <span className={s.chevron}><ChevronRight /></span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
