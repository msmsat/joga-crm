import { InsightsPanel } from './InsightsPanel';
import styles from '../../Reports.module.css';
import type { Insight } from '../../types';

export interface MainWithInsightsProps {
  insights: Insight[];
  children: React.ReactNode;
}

// Сигнал стоит рядом с главным графиком, а не в подвале: владелец читает
// «что не так» одновременно с данными. 320px — минимум, при котором текст
// сигнала и кнопка действия живут в две строки без переносов слов. На узких
// экранах (<1280px) колонка сигнала складывается под график — см. media query
// в Reports.module.css, инлайн-style не может отреагировать на @media.
export function MainWithInsights({ insights, children }: MainWithInsightsProps) {
  // Колонка видна всегда: при нуле советов панель показывает «всё в порядке»,
  // иначе владелец решает, что блок советов пропал (инцидент 26.07).
  return (
    <div className={`${styles.mainWithInsights} ${styles.mainWithInsightsSide}`}>
      {children}
      <InsightsPanel insights={insights} variant="side" />
    </div>
  );
}
