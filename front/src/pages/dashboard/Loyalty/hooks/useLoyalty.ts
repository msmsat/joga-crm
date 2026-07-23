import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ConfigProgramKey, ProgramKey, DrawerConfig } from '../types';
import { loyaltyApi } from '../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../api/queryKeys';
import { useToast } from '../../../../components/ui/Toast';
import { errorMessage } from '../../../../api/errorMessage';
import { validateConfig, type ConfigErrors } from './validateConfig';
import type {
  CertificateConfig,
  DiscountConfig,
  LoyaltyConfig,
  LoyaltyLevel,
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

async function fetchAllConfigs(): Promise<ProgramConfigs> {
  const [loyalty, discounts, certificates, referral] = await Promise.all([
    loyaltyApi.getConfig(),
    loyaltyApi.getDiscountConfig(),
    loyaltyApi.getCertificateConfig(),
    loyaltyApi.getReferralConfig(),
  ]);
  return { loyalty, discounts, certificates, referral };
}

export function useLoyalty() {
  const qc = useQueryClient();
  const { t } = useTranslation('loyalty');
  const toast = useToast();
  const { data: serverConfigs = EMPTY_CONFIGS, isPending: configsLoading, isError: loadError, refetch: refetchConfigs } = useQuery({
    queryKey: queryKeys.loyaltyConfigs,
    queryFn: fetchAllConfigs,
  });

  useEffect(() => {
    if (loadError) toast.error(t('toasts.loadFailed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  // Черновик формы дровера: локальные правки поверх серверных данных, пока не
  // сохранены. Сбрасывается при открытии дровера и после успешного сохранения
  // (invalidate перечитывает configs — черновик снова становится «= серверу»).
  const [draft, setDraft] = useState<Partial<ProgramConfigs>>({});
  const [errors, setErrors] = useState<ConfigErrors>({});
  const configs: ProgramConfigs = {
    loyalty: draft.loyalty !== undefined ? draft.loyalty : serverConfigs.loyalty,
    discounts: draft.discounts !== undefined ? draft.discounts : serverConfigs.discounts,
    certificates: draft.certificates !== undefined ? draft.certificates : serverConfigs.certificates,
    referral: draft.referral !== undefined ? draft.referral : serverConfigs.referral,
  };

  // Уровни (задача 7): черновик — локальный редактируемый список, seed из
  // сервера при открытии дровера «loyalty». null = «не редактируется сейчас»
  // (дровер закрыт или открыт не на loyalty) — тогда сохранять уровни не нужно.
  const { data: serverLevels = [] } = useQuery({
    queryKey: queryKeys.loyaltyLevels,
    queryFn: () => loyaltyApi.getLevels(),
  });
  const [levelsDraft, setLevelsDraft] = useState<LoyaltyLevel[] | null>(null);

  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const programs: Record<ConfigProgramKey, boolean> = {
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
    setDraft({});
    setErrors({});
    setLevelsDraft(key === 'loyalty' ? serverLevels.map(lvl => ({ ...lvl })) : null);
    setDrawer({ key, title });
    requestAnimationFrame(() => setDrawerVisible(true));
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setTimeout(() => setDrawer(null), 300);
  };

  // Пороги непрерывны by design: правится только «от» каждого уровня, «до» —
  // всегда «от» следующего; первый уровень всегда «от» 0. Дыры/перекрытия
  // невозможны на уровне UI, серверная валидация — вторая линия защиты.
  const recomputeChain = (levels: LoyaltyLevel[]): LoyaltyLevel[] => {
    const sorted = [...levels].sort((a, b) => a.sort_order - b.sort_order);
    return sorted.map((lvl, i) => ({
      ...lvl,
      sort_order: i,
      min_threshold: i === 0 ? 0 : lvl.min_threshold,
      max_threshold: i === sorted.length - 1 ? null : sorted[i + 1].min_threshold,
    }));
  };

  const updateLevel = (id: number, patch: Partial<Pick<LoyaltyLevel, 'name' | 'color' | 'min_threshold'>>) => {
    setLevelsDraft(prev => prev && recomputeChain(prev.map(lvl => (lvl.id === id ? { ...lvl, ...patch } : lvl))));
  };

  const addLevel = () => {
    setLevelsDraft(prev => {
      if (!prev) return prev;
      const lastMin = prev.length ? Math.max(...prev.map(l => l.min_threshold)) : 0;
      const newLevel: LoyaltyLevel = {
        id: -Date.now(), // временный отрицательный id — сервер заменит настоящим (id: undefined в PUT)
        name: t('config.newLevelName'),
        color: '#FCAE91',
        min_threshold: lastMin + 1000,
        max_threshold: null,
        sort_order: prev.length,
      };
      return recomputeChain([...prev, newLevel]);
    });
  };

  const removeLevel = (id: number) => {
    setLevelsDraft(prev => {
      if (!prev || prev.length <= 1) return prev; // последний уровень удалить нельзя
      return recomputeChain(prev.filter(lvl => lvl.id !== id));
    });
  };

  // Локальная правка полей формы (без запроса) — форма контролируемая.
  const patchConfig = <K extends ConfigProgramKey>(key: K, patch: Partial<ProgramConfigs[K]>) => {
    setDraft(prev => ({ ...prev, [key]: { ...configs[key], ...patch } }));
    if (Object.keys(errors).length) {
      setErrors(prev => {
        const next = { ...prev };
        for (const field of Object.keys(patch)) delete next[field];
        return next;
      });
    }
  };

  const invalidateConfigs = () => qc.invalidateQueries({ queryKey: queryKeys.loyaltyConfigs });
  const invalidateStats = () => qc.invalidateQueries({ queryKey: queryKeys.loyaltyStats });
  const invalidateLevels = () => qc.invalidateQueries({ queryKey: queryKeys.loyaltyLevels });

  const saveMut = useMutation({
    mutationFn: async (key: ConfigProgramKey): Promise<void> => {
      const body = { ...(configs[key] ?? {}), is_enabled: true };
      await API[key].patch(body as never);
      // Уровни сохраняются одним сабмитом вместе с конфигом карт лояльности (задача 7, п.4).
      if (key === 'loyalty' && levelsDraft) {
        await loyaltyApi.updateLevels(levelsDraft.map(lvl => ({
          ...lvl,
          id: lvl.id < 0 ? undefined : lvl.id, // отрицательный id — новый уровень черновика
        })));
      }
    },
    onSuccess: () => {
      invalidateConfigs();
      invalidateStats();
      invalidateLevels();
      toast.success(t('toasts.saved'));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ key, enabled }: { key: ConfigProgramKey; enabled: boolean }): Promise<void> => {
      await API[key].patch({ is_enabled: enabled } as never);
    },
    onSuccess: () => {
      invalidateConfigs();
      invalidateStats();
    },
    // Тумблер не менялся оптимистично — на ошибке просто остаётся как был
    // (invalidate не вызываем), но owner должен узнать, что действие не прошло.
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  // «Сохранить и активировать»: валидация локально → PATCH нужного конфига с is_enabled=true.
  const handleSave = async (key: ConfigProgramKey) => {
    const fieldErrors = validateConfig(key, configs, t, levelsDraft);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    try {
      await saveMut.mutateAsync(key);
    } catch {
      return; // ошибка уже показана тостом в onError, дровер оставляем открытым
    }
    setDraft(prev => ({ ...prev, [key]: undefined }));
    setLevelsDraft(null);
    closeDrawer();
  };

  // Выключение программы (тумблер на карточке): PATCH is_enabled=false.
  const toggleProgram = async (key: ConfigProgramKey, enabled: boolean) => {
    try {
      await toggleMut.mutateAsync({ key, enabled });
    } catch {
      // тост уже показан в onError мутации
    }
  };

  return {
    programs, configs, patchConfig, drawer, drawerVisible, mounted,
    saving: saveMut.isPending, errors, loadError, refetchConfigs, configsLoading,
    levelsDraft, updateLevel, addLevel, removeLevel,
    drawerRef, openDrawer, closeDrawer, handleSave, toggleProgram,
  };
}
