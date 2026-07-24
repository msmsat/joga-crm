import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { aiApi } from '../../../../api/ai/ai.api';
import { ApiError } from '../../../../api/client';
import { queryKeys } from '../../../../api/queryKeys';
import { useToast } from '../../../../components/ui/Toast';
import type { AISettings } from '../../../../api/ai/ai.types';
import type { AgentConfig, AgentTone, AIUISettings, AIModel, AILanguage } from '../types';

// Коды серверного гейта тумблеров (эпик AI-2, задача 1) — человеческий текст вместо
// машинного code. Реальное подключение токенов — эпик AI-3, отсюда и формулировки.
function aiErrorText(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    if (err.message === 'tg_token_required') return t('errors.tg_token_required');
    if (err.message === 'ig_not_connected') return t('errors.ig_not_connected');
    return err.message || t('common:errors.unknown');
  }
  if (err instanceof TypeError) return t('common:errors.network');
  return t('common:errors.unknown');
}

const EMPTY_CHANNEL: AgentConfig['telegram'] = {
  enabled: false, token: '', username: '', tone: 'friendly', maxLength: 500, offHoursOnly: false, handledCount: 0, avgRating: 0,
};
const EMPTY_AGENT_CONFIG: AgentConfig = {
  telegram: EMPTY_CHANNEL,
  instagram: { ...EMPTY_CHANNEL, maxLength: 300, offHoursOnly: true },
  systemPrompt: '',
};

function toAgentConfig(s: AISettings): AgentConfig {
  return {
    telegram: {
      enabled: s.tg_enabled, token: s.tg_token ?? '', username: s.tg_username ?? '',
      tone: s.tg_tone as AgentTone, maxLength: s.tg_max_length,
      offHoursOnly: false, handledCount: s.tg_handled_count, avgRating: s.tg_avg_rating,
    },
    instagram: {
      enabled: s.ig_enabled, token: s.ig_token ?? '', username: s.ig_username ?? '',
      tone: s.ig_tone as AgentTone, maxLength: s.ig_max_length,
      offHoursOnly: s.ig_off_hours_only, handledCount: s.ig_handled_count, avgRating: s.ig_avg_rating,
      expiresAt: s.ig_token_expires_at,
    },
    systemPrompt: s.system_prompt ?? '',
  };
}

export function useAIAgent() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation('ai');

  const { data: settings } = useQuery({
    queryKey: queryKeys.aiSettings,
    queryFn: aiApi.getSettings,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (payload: Partial<AISettings>) => aiApi.updateSettings(payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: queryKeys.aiSettings });
      const prev = qc.getQueryData<AISettings>(queryKeys.aiSettings);
      if (prev) qc.setQueryData<AISettings>(queryKeys.aiSettings, { ...prev, ...payload });
      return { prev };
    },
    onError: (err, _payload, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.aiSettings, ctx.prev);
      toast.error(aiErrorText(err, t));
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.aiSettings, data);
      toast.success(t('toasts.settingsSaved'));
    },
  });

  const aiSettings: AIUISettings = {
    model: (settings?.model as AIModel) ?? 'velora-3.5',
    language: (settings?.language as AILanguage) ?? 'auto',
  };

  const agentConfig: AgentConfig = settings ? toAgentConfig(settings) : EMPTY_AGENT_CONFIG;

  const updateAISettings = useCallback((patch: Partial<AIUISettings>) => {
    mutation.mutate(patch);
  }, [mutation]);

  const toggleChannel = useCallback((channel: 'telegram' | 'instagram') => {
    const prefix = channel === 'telegram' ? 'tg' : 'ig';
    const current = channel === 'telegram' ? agentConfig.telegram.enabled : agentConfig.instagram.enabled;
    mutation.mutate({ [`${prefix}_enabled`]: !current } as Partial<AISettings>);
  }, [mutation, agentConfig]);

  // Тон/лимит/офчасы/промпт — «Сохранить» шлёт только реально изменённые поля.
  const saveChannelFields = useCallback((draft: AgentConfig) => {
    if (!settings) return;
    const patch: Partial<AISettings> = {};
    if (draft.systemPrompt !== (settings.system_prompt ?? '')) patch.system_prompt = draft.systemPrompt;
    if (draft.telegram.tone !== settings.tg_tone) patch.tg_tone = draft.telegram.tone;
    if (draft.telegram.maxLength !== settings.tg_max_length) patch.tg_max_length = draft.telegram.maxLength;
    if (draft.instagram.tone !== settings.ig_tone) patch.ig_tone = draft.instagram.tone;
    if (draft.instagram.maxLength !== settings.ig_max_length) patch.ig_max_length = draft.instagram.maxLength;
    if (draft.instagram.offHoursOnly !== settings.ig_off_hours_only) patch.ig_off_hours_only = draft.instagram.offHoursOnly;
    if (Object.keys(patch).length === 0) return;
    mutation.mutate(patch);
  }, [settings, mutation]);

  const verifyTelegramMutation = useMutation({
    mutationFn: (token: string) => aiApi.verifyTelegramToken(token),
    onSuccess: ({ username }) => {
      qc.invalidateQueries({ queryKey: queryKeys.aiSettings });
      toast.success(t('telegram.verifiedToast', { username }));
    },
    onError: () => toast.error(t('telegram.verifyFailedToast')),
  });

  const disconnectTelegramMutation = useMutation({
    mutationFn: () => aiApi.disconnectTelegram(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.aiSettings });
      toast.success(t('telegram.disconnectedToast'));
    },
    onError: (err) => toast.error(aiErrorText(err, t)),
  });

  const connectInstagramMutation = useMutation({
    mutationFn: () => aiApi.getInstagramOauthUrl(),
    onSuccess: ({ url }) => { window.location.href = url; }, // полный редирект, не попап
    onError: (err) => toast.error(aiErrorText(err, t)),
  });

  const disconnectInstagramMutation = useMutation({
    mutationFn: () => aiApi.disconnectInstagram(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.aiSettings });
      toast.success(t('instagram.disconnectedToast'));
    },
    onError: (err) => toast.error(aiErrorText(err, t)),
  });

  return {
    aiSettings, agentConfig, isSaving: mutation.isPending,
    // Настройки ещё не загрузились — модалку не открываем: локальный draft внутри
    // засеется от agentConfig в момент маунта, и до появления настоящих данных
    // это будет EMPTY_AGENT_CONFIG (пустой промпт), который «Сохранить» перезапишет
    // поверх настоящего.
    isLoaded: settings !== undefined,
    // Гейт тумблера (AI-3, задача 1/2): источник правды — реально сохранённый в БД
    // токен, а не то, что человек сейчас печатает в поле и ещё не проверил.
    tgConnected: !!settings?.tg_token,
    // Гейт Instagram (AI-3, задача 5) по спецификации завязан на ig_user_id
    // (заполняется только успешным OAuth-обменом), а не на срок токена — просрочку
    // сервер отдельно отловит 400-кой при попытке включить тумблер (тот же тост+откат).
    igConnected: !!settings?.ig_user_id,
    updateAISettings, toggleChannel, saveChannelFields,
    verifyTelegram: verifyTelegramMutation.mutate,
    isVerifyingTelegram: verifyTelegramMutation.isPending,
    disconnectTelegram: () => disconnectTelegramMutation.mutateAsync(),
    connectInstagram: connectInstagramMutation.mutate,
    isConnectingInstagram: connectInstagramMutation.isPending,
    disconnectInstagram: () => disconnectInstagramMutation.mutateAsync(),
  };
}
