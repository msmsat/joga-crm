import { useLoyalty } from './hooks/useLoyalty';
import { PROGRAM_METADATA } from './constants';
import { PROGRAM_ICONS } from './components/ui/LoyaltyIcons';
import ProgressHeader from './components/sections/ProgressHeader';
import ProgramsGrid from './components/sections/ProgramsGrid';
import StatsBoard from './components/sections/StatsBoard';
import LoyaltyDrawer from './components/drawer/LoyaltyDrawer';
import type { Program } from './types';
import styles from './Loyalty.module.css';

export default function Loyalty() {
  const { programs, configs, patchConfig, drawer, drawerVisible, mounted, saving, drawerRef, openDrawer, closeDrawer, handleSave, toggleProgram } = useLoyalty();

  const programsList: Program[] = PROGRAM_METADATA.map(meta => ({
    ...meta,
    icon: PROGRAM_ICONS[meta.key],
    configured: programs[meta.key],
  }));

  const configuredCount = Object.values(programs).filter(Boolean).length;

  return (
    <>
      <div className={`${styles.pageContent}${drawerVisible ? ` ${styles.pageContentPushed}` : ''}`}>
        <ProgressHeader configuredCount={configuredCount} total={PROGRAM_METADATA.length} openDrawer={openDrawer} />
        <ProgramsGrid programsList={programsList} openDrawer={openDrawer} toggleProgram={toggleProgram} />
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
          closeDrawer={closeDrawer}
          handleSave={handleSave}
          programsList={programsList}
        />
      )}
    </>
  );
}
