import { useState, useEffect, useRef } from 'react';
import type { ProgramKey, DrawerConfig } from '../types';
import { loyaltyApi } from '../../../../api/loyalty/loyalty.api';
import type {
  CertificateConfig,
  DiscountConfig,
  LoyaltyConfig,
  ReferralConfig,
} from '../../../../api/loyalty/loyalty.types';

export interface ProgramConfigs {
  loyalty: LoyaltyConfig | null;
  discounts: DiscountConfig | null;
  certificates: CertificateConfig | null;
  referral: ReferralConfig | null;
}

const EMPTY_CONFIGS: ProgramConfigs = {
  loyalty: null, discounts: null, certificates: null, referral: null,
};

// Каждый ключ знает свой get/patch — один диспетчер вместо четырёх веток.
const API = {
  loyalty:       { get: loyaltyApi.getConfig,             patch: loyaltyApi.updateConfig },
  discounts:     { get: loyaltyApi.getDiscountConfig,     patch: loyaltyApi.updateDiscountConfig },
  certificates:  { get: loyaltyApi.getCertificateConfig,  patch: loyaltyApi.updateCertificateConfig },
  referral:      { get: loyaltyApi.getReferralConfig,     patch: loyaltyApi.updateReferralConfig },
} as const;

export function useLoyalty() {
  const [configs, setConfigs] = useState<ProgramConfigs>(EMPTY_CONFIGS);
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    Promise.all([
      loyaltyApi.getConfig(),
      loyaltyApi.getDiscountConfig(),
      loyaltyApi.getCertificateConfig(),
      loyaltyApi.getReferralConfig(),
    ]).then(([loyalty, discounts, certificates, referral]) =>
      setConfigs({ loyalty, discounts, certificates, referral })
    ).catch(() => {/* дровер откроется на дефолтах формы, если конфиг не загрузился */});
  }, []);

  const programs: Record<ProgramKey, boolean> = {
    loyalty: configs.loyalty?.is_enabled ?? false,
    discounts: configs.discounts?.is_enabled ?? false,
    certificates: configs.certificates?.is_enabled ?? false,
    referral: configs.referral?.is_enabled ?? false,
  };

  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    const preventScroll = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', preventScroll, { passive: false });
    return () => el.removeEventListener('wheel', preventScroll);
  }, [drawer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerVisible(false);
        setTimeout(() => setDrawer(null), 300);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const openDrawer = (key: ProgramKey, title: string) => {
    if (drawer?.key === key && drawerVisible) {
      closeDrawer();
      return;
    }
    setDrawer({ key, title });
    requestAnimationFrame(() => setDrawerVisible(true));
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setTimeout(() => setDrawer(null), 300);
  };

  // Локальная правка полей формы (без запроса) — форма контролируемая.
  const patchConfig = <K extends ProgramKey>(key: K, patch: Partial<ProgramConfigs[K]>) =>
    setConfigs(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // «Сохранить и активировать»: PATCH нужного конфига с is_enabled=true.
  const handleSave = async (key: ProgramKey) => {
    setSaving(true);
    try {
      const body = { ...(configs[key] ?? {}), is_enabled: true };
      const saved = await API[key].patch(body as never);
      setConfigs(prev => ({ ...prev, [key]: saved as never }));
      closeDrawer();
    } finally {
      setSaving(false);
    }
  };

  // Выключение программы (тумблер на карточке): PATCH is_enabled=false.
  const toggleProgram = async (key: ProgramKey, enabled: boolean) => {
    const saved = await API[key].patch({ is_enabled: enabled } as never);
    setConfigs(prev => ({ ...prev, [key]: saved as never }));
  };

  return {
    programs, configs, patchConfig, drawer, drawerVisible, mounted, saving,
    drawerRef, openDrawer, closeDrawer, handleSave, toggleProgram,
  };
}
