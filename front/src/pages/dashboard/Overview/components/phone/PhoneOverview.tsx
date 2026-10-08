import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MotionConfig } from 'framer-motion';
import type { OverviewData } from '../../hooks/useOverviewData';
import type { MetricConfig } from '../../types';
import TasksWidget from '../widgets/TasksWidget';
import Greeting from './Greeting';
import PulseHero from './PulseHero';
import MetricRail from './MetricRail';
import TodayStrip from './TodayStrip';
import AttentionList from './AttentionList';
import ActivityTimeline from './ActivityTimeline';
import MonthPanel from './MonthPanel';
import s from './PhoneOverview.module.css';

interface Props {
  d: OverviewData;
  /** «Не удалось загрузить» с «Повторить» — та же карточка, что на большом экране. */
  errorCard: ReactNode;
}

/** Сырое значение активной метрики владельца: главная карточка «добегает» до
 *  числа, а не до готовой строки. null — сводка ещё едет. */
function rawValue(d: OverviewData): number | null {
  if (d.summaryLoading || !d.summary) return null;
  switch (d.activeConfig?.id) {
    case 'revenue': return d.summary.revenue;
    case 'clients': return d.summary.active_clients;
    case 'bookings': return d.summary.bookings;
    case 'retention': return d.summary.retention;
    default: return null;
  }
}

/**
 * Дашборд на телефоне. Данные — те же, что у большого экрана (useOverviewData),
 * меняется подача: одна колонка, крупный «пульс» вместо сетки из четырёх плиток,
 * день лентой, а редкие сводки свёрнуты в одну карточку с переключателем.
 * Права те же: деньги и лента студии — только владельцу.
 */
export default function PhoneOverview({ d, errorCard }: Props) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const failed = !d.forbidden && d.isFirstLoadError;
  const studio = d.isOwner && !d.forbidden && !failed;

  // У владельца плитка переключает главную карточку, у админа и тренера карточки
  // нет — плитка сразу ведёт в свой раздел.
  const pickMetric = (m: MetricConfig) => (studio ? d.setActiveMetric(m.id) : navigate(m.route));

  return (
    <MotionConfig reducedMotion="user">
      <div className={s.page}>
        <Greeting />

        {d.forbidden && <div className={s.notice}>{t('state.ownerOnly')}</div>}
        {failed && errorCard}

        {studio && d.activeConfig && (
          <div className={s.pulse}>
            <PulseHero
              metric={d.activeConfig}
              value={rawValue(d)}
              series={d.series}
              seriesLoading={d.seriesLoading}
              period={d.period}
              setPeriod={d.setPeriod}
              currencySymbol={d.currencySymbol}
            />
            <MetricRail metrics={d.metrics} activeId={d.activeMetric} onPick={pickMetric} loading={d.summaryLoading} />
          </div>
        )}

        {!d.isOwner && !d.forbidden && !failed && (
          <MetricRail grid metrics={d.metrics} onPick={pickMetric} loading={d.summaryLoading} />
        )}

        <TodayStrip role={d.role} />

        {studio && <AttentionList insights={d.insights} loading={d.insightsLoading} />}

        {/* Задачи — всем ролям: своя RBAC-фильтрация внутри (D2/D4). */}
        <TasksWidget phone />

        {studio && <ActivityTimeline events={d.events} />}

        {studio && (
          <MonthPanel
            summary={d.summary}
            services={d.services}
            trainers={d.trainers}
            bookingModes={d.bookingModes}
            currencySymbol={d.currencySymbol}
            loading={d.widgetsLoading}
          />
        )}
      </div>
    </MotionConfig>
  );
}
