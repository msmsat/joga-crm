import { useLoyalty } from './hooks/useLoyalty';
import { PROGRAM_METADATA } from './constants';
import { PROGRAM_ICONS } from './components/ui/LoyaltyIcons';
import ProgressHeader from './components/sections/ProgressHeader';
import ProgramsGrid from './components/sections/ProgramsGrid';
import StatsBoard from './components/sections/StatsBoard';
import LoyaltyDrawer from './components/drawer/LoyaltyDrawer';
import type { Program } from './types';

export default function Loyalty() {
  const { programs, drawer, drawerVisible, mounted, drawerRef, openDrawer, closeDrawer, handleSave } = useLoyalty();

  const programsList: Program[] = PROGRAM_METADATA.map(meta => ({
    ...meta,
    icon: PROGRAM_ICONS[meta.key],
    configured: programs[meta.key],
  }));

  const configuredCount = Object.values(programs).filter(Boolean).length;

  return (
    <>
      <ProgressHeader configuredCount={configuredCount} openDrawer={openDrawer} />
      <ProgramsGrid programsList={programsList} openDrawer={openDrawer} />
      <StatsBoard configuredCount={configuredCount} mounted={mounted} />
      {drawer && (
        <LoyaltyDrawer
          drawer={drawer}
          drawerVisible={drawerVisible}
          drawerRef={drawerRef}
          closeDrawer={closeDrawer}
          handleSave={handleSave}
          programsList={programsList}
        />
      )}
    </>
  );
}
