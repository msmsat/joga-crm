import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from '../../../../../components/ui/index';
import { Segmented } from '../../../../../components/ui/modal';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { useClientEvents } from '../../hooks/useClientsList';
import { EVENT_TABS, buildTimeline, inTab, type EventTab } from '../../utils/clientEvents';
import { EventItem } from './EventItem';
import { EventSummary } from './EventSummary';
import styles from './ClientEvents.module.css';

/** Пустая вкладка зовёт к действию, которое её наполнит; тренеру действий не даём. */
export interface EventActions { onBook: () => void; onBuy: () => void; onBonus: () => void }

const EMPTY_ICON = { all: 'calendar', visits: 'calendar', payments: 'money', bonuses: 'gift' } as const;

export function ClientEventsTab({ clientId, tab, onTabChange, actions }: {
  clientId: number;
  tab: EventTab;
  onTabChange: (tab: EventTab) => void;
  /** null — смотрит тренер: события он видит, но записывать и продавать не может. */
  actions: EventActions | null;
}) {
  const { t, i18n } = useTranslation('clients');
  const locale = i18n.resolvedLanguage || i18n.language;
  const currency = useStudioCurrency();
  const { events, isLoading, isError, isFetching, refetch } = useClientEvents(clientId, true);
  const tabsId = useId();
  const panelId = `${tabsId}-panel`;

  const visible = useMemo(() => events.filter(e => inTab(e, tab)), [events, tab]);
  const timeline = useMemo(() => buildTimeline(visible, locale, t), [visible, locale, t]);

  const emptyActions: Record<EventTab, [string, () => void]> | null = actions && {
    all: [t('panel.actions.book'), actions.onBook],
    visits: [t('panel.actions.book'), actions.onBook],
    payments: [t('panel.wallet.buy'), actions.onBuy],
    bonuses: [t('panel.bonusPanel.title'), actions.onBonus],
  };
  const action = emptyActions?.[tab];

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        <Segmented
          fit
          id={tabsId}
          panelId={panelId}
          ariaLabel={t('panel.tabs.events')}
          value={tab}
          onChange={onTabChange}
          // Только слова, без счётчиков: в панели шириной 340 px число съедало
          // подпись уже по-украински («Запи… 7»). Итоги — в сводке вкладки.
          // fit — доли по длине слов: «Pagamentos» и «Betalningar» в равную
          // четверть не помещались.
          options={EVENT_TABS.map(key => ({ value: key, label: t(`panel.events.tabs.${key}`) }))}
        />
      </div>

      <div id={panelId} className={styles.pane} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} aria-busy={isLoading}>
        {isLoading ? <Skeleton/> : isError ? (
          <div role="alert">
            <EmptyState
              size="sm"
              icon="calendar"
              title={t('common:errors.loadFailed')}
              action={<Button size="sm" variant="ghost" loading={isFetching} onClick={() => { void refetch(); }}>{t('common:errors.retry')}</Button>}
            />
          </div>
        ) : visible.length === 0 ? (
            <EmptyState
              size="sm"
              icon={EMPTY_ICON[tab]}
              title={t(`panel.events.empty.${tab}.title`)}
              text={t(`panel.events.empty.${tab}.text`)}
              action={action && <Button size="sm" variant="ghost" onClick={action[1]}>{action[0]}</Button>}
            />
          ) : (
            <>
              <EventSummary tab={tab} events={visible} currency={currency}/>
              {timeline.ahead.length > 0 && (
                <section className={styles.ahead}>
                  <h3 className={styles.groupTitle}>
                    {t('panel.events.ahead')}
                    <span className={styles.groupCount}>{timeline.ahead.length}</span>
                  </h3>
                  <ol className={styles.list}>
                    {timeline.ahead.map((event, i) => <EventItem key={i} event={event} currency={currency}/>)}
                  </ol>
                </section>
              )}
              {timeline.months.map(group => (
                <section key={group.key} className={styles.group}>
                  <h3 className={styles.groupTitle}>{group.label}</h3>
                  <ol className={styles.list}>
                    {group.items.map((event, i) => <EventItem key={i} event={event} currency={currency}/>)}
                  </ol>
                </section>
              ))}
            </>
          )}
      </div>
    </div>
  );
}

/** Три строки той же высоты, что настоящие: лента не прыгает, когда приходят данные. */
function Skeleton() {
  return (
    <ol className={styles.list} aria-hidden="true">
      {[72, 56, 64].map(width => (
        <li key={width} className={styles.skeleton}>
          <span className={styles.skelNode}/>
          <div>
            <div className={styles.skelLine} style={{ width: '34%' }}/>
            <div className={styles.skelLine} style={{ width: `${width}%`, height: '13px', marginTop: '8px' }}/>
            <div className={styles.skelLine} style={{ width: '40%', marginTop: '8px' }}/>
          </div>
        </li>
      ))}
    </ol>
  );
}
