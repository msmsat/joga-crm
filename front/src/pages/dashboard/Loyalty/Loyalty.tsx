import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLoyalty } from './hooks/useLoyalty';
import { PROGRAM_METADATA } from './constants';
import { PROGRAM_ICONS } from './components/ui/LoyaltyIcons';
import ProgressHeader from './components/sections/ProgressHeader';
import ProgressHeaderSkeleton from './components/sections/ProgressHeaderSkeleton';
import ProgramsGrid from './components/sections/ProgramsGrid';
import ProgramsGridSkeleton from './components/sections/ProgramsGridSkeleton';
import StatsBoard from './components/sections/StatsBoard';
import ScenariosBoard from './components/sections/ScenariosBoard';
import SegmentsBoard from './components/sections/SegmentsBoard';
import RetentionBoard from './components/sections/RetentionBoard';
import LoyaltyDrawer from './components/drawer/LoyaltyDrawer';
import type { Program } from './types';
import styles from './Loyalty.module.css';
import { loyaltyApi } from '../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../api/queryKeys';

export default function Loyalty() {
  const { t } = useTranslation('loyalty');
  const { programs, configs, patchConfig, drawer, drawerVisible, mounted, saving, errors, loadError, refetchConfigs, configsLoading, levelsDraft, updateLevel, addLevel, removeLevel, drawerRef, openDrawer, closeDrawer, handleSave, toggleProgram } = useLoyalty();

  // Живые счётчики карточек программ (задача 6, V5-2; discounts — V5-5 задача 7:
  // реальные активные ClientOffer вместо хардкоженного % скидки) — те же данные,
  // что StatsBoard, Query-кэш их не задублирует. Промокоды и депозит не имеют
  // конфига (карточка «включена» = есть активные коды / ненулевой баланс),
  // поэтому сводка грузится всегда — иначе студия без остальных программ
  // никогда бы её не увидела.
  const { data: stats } = useQuery({
    queryKey: queryKeys.loyaltyStats,
    queryFn: () => loyaltyApi.getStats(),
  });

  const promocodesActive = (stats?.program_counters.promocodes ?? 0) > 0;
  const depositActive = (stats?.program_counters.deposit ?? 0) > 0;
  const configuredCount = Object.values(programs).filter(Boolean).length
    + (promocodesActive ? 1 : 0) + (depositActive ? 1 : 0);

  const programsList: Program[] = PROGRAM_METADATA.map(meta => {
    const counter = stats?.program_counters[meta.key] !== undefined
      ? { value: stats.program_counters[meta.key], label: t(meta.stats.labelKey) }
      : undefined;
    const configured = meta.key === 'promocodes' ? promocodesActive
      : meta.key === 'deposit' ? depositActive
      : programs[meta.key];
    return {
      ...meta,
      title: t(meta.titleKey),
      desc: t(meta.descKey),
      icon: PROGRAM_ICONS[meta.key],
      configured,
      stats: counter,
    };
  });

  return (
    <>
      <div className={`${styles.pageContent}${drawerVisible ? ` ${styles.pageContentPushed}` : ''}`}>
        {loadError && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
            background: 'rgba(216,140,154,0.06)', border: '1px solid rgba(216,140,154,0.25)',
            borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: '24px',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#D88C9A' }}>{t('toasts.loadFailed')}</span>
            <button className={styles.ghostBtn} onClick={() => refetchConfigs()}>{t('toasts.retry')}</button>
          </div>
        )}
        {configsLoading ? (
          <>
            <ProgressHeaderSkeleton />
            <ProgramsGridSkeleton />
          </>
        ) : (
          <>
            <ProgressHeader configuredCount={configuredCount} total={PROGRAM_METADATA.length} openDrawer={openDrawer} />
            <ProgramsGrid programsList={programsList} openDrawer={openDrawer} toggleProgram={toggleProgram} />
          </>
        )}
        <ScenariosBoard />
        <SegmentsBoard />
        <RetentionBoard />
        <StatsBoard configuredCount={configuredCount} mounted={mounted} />
      </div>
      {drawer && (
        <LoyaltyDrawer
          drawer={drawer}
          drawerVisible={drawerVisible}
          drawerRef={drawerRef}
          configs={configs}
          patchConfig={patchConfig}
          saving={saving}
          errors={errors}
          levelsDraft={levelsDraft}
          onUpdateLevel={updateLevel}
          onAddLevel={addLevel}
          onRemoveLevel={removeLevel}
          closeDrawer={closeDrawer}
          handleSave={handleSave}
          programsList={programsList}
        />
      )}
    </>
  );
}
