import { useState, useEffect, useRef } from 'react';
import type { ProgramKey, DrawerConfig } from '../types';

export function useLoyalty() {
  const [programs, setPrograms] = useState<Record<ProgramKey, boolean>>({
    loyalty: false,
    discounts: false,
    certificates: false,
    subscriptions: false,
    referral: false,
  });
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const openDrawer = (key: ProgramKey, title: string) => {
    setDrawer({ key, title });
    requestAnimationFrame(() => setDrawerVisible(true));
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setTimeout(() => setDrawer(null), 300);
  };

  const handleSave = (key: ProgramKey) => {
    setPrograms(prev => ({ ...prev, [key]: true }));
    closeDrawer();
  };

  return { programs, drawer, drawerVisible, mounted, drawerRef, openDrawer, closeDrawer, handleSave };
}
