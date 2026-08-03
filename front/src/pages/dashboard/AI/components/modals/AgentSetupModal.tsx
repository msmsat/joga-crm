import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfirmModal } from '../../../../../components/ui/index';
import { Button } from '@/components/ui-shadcn/button';
import { cn } from '@/lib/utils';
import type { AgentChannel, AgentConfig, AgentTone } from '../../types';
import PulseRingSVG from '../animations/PulseRingSVG';
import WaveformSVG from '../animations/WaveformSVG';
import ChannelPane from './ChannelPane';
import PromptPane from './PromptPane';
import { CTA, TelegramConnect, InstagramConnect, WhatsappConnect } from './ConnectAreas';

interface AgentSetupModalProps {
  config: AgentConfig;
  isSaving: boolean;
  tgConnected: boolean;
  isVerifyingTelegram: boolean;
  igConnected: boolean;
  isConnectingInstagram: boolean;
  waConnected: boolean;
  isConnectingWhatsapp: boolean;
  onConnectWhatsapp: () => void;
  onToggleChannel: (channel: AgentChannel) => void;
  onSave: (draft: AgentConfig) => void;
  onVerifyTelegram: (token: string) => void;
  onDisconnectTelegram: () => Promise<void>;
  onConnectInstagram: () => void;
  onDisconnectInstagram: () => Promise<void>;
  onClose: () => void;
}

type Tab = AgentChannel | 'prompt';

const ICONS: Record<Tab, React.ReactNode> = {
  telegram: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
    </svg>
  ),
  instagram: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" strokeWidth="0" />
    </svg>
  ),
  whatsapp: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  prompt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M18 17.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </svg>
  ),
};

// Одно окно фиксированного размера: канал выбирается слева, содержимое справа
// прокручивается внутри себя — модалка не «прыгает» при переключении вкладок.
// Тон и лимит ответа общие для всех каналов и живут на вкладке промпта.
export default function AgentSetupModal({
  config, isSaving, tgConnected, isVerifyingTelegram, igConnected, isConnectingInstagram,
  waConnected, isConnectingWhatsapp, onConnectWhatsapp, onToggleChannel, onSave,
  onVerifyTelegram, onDisconnectTelegram, onConnectInstagram, onDisconnectInstagram, onClose,
}: AgentSetupModalProps) {
  const { t } = useTranslation('ai');
  const [activeTab, setActiveTab] = useState<Tab>('telegram');
  // Тон/лимит/офчасы/промпт правятся локально до «Сохранить» — enabled/статистика
  // всегда берутся из живого config (тумблер шлёт PATCH сразу, см. useAIAgent).
  const [draft, setDraft] = useState<AgentConfig>(config);
  const [confirmDisconnect, setConfirmDisconnect] = useState<'telegram' | 'instagram' | null>(null);

  useEffect(() => {
    // Esc над открытым подтверждением закрывает только его (ConfirmModal кита).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !confirmDisconnect) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirmDisconnect]);

  const updateChannel = (channel: AgentChannel, field: string, value: string | number | boolean | AgentTone) =>
    setDraft(prev => ({ ...prev, [channel]: { ...prev[channel], [field]: value } }));

  // Тон и лимит — одно значение на все каналы (на сервере поля per-channel).
  const updateAllChannels = (field: 'tone' | 'maxLength', value: AgentTone | number) =>
    setDraft(prev => ({
      ...prev,
      telegram: { ...prev.telegram, [field]: value },
      instagram: { ...prev.instagram, [field]: value },
      whatsapp: { ...prev.whatsapp, [field]: value },
    }));

  // Не даём уйти на сервер невалидному tg_max_length/ig_max_length (бэк: 50–4000).
  const maxLengthInvalid = (n: number) => n < 50 || n > 4000;
  const canSave = !maxLengthInvalid(draft.telegram.maxLength) && !maxLengthInvalid(draft.instagram.maxLength)
    && !maxLengthInvalid(draft.whatsapp.maxLength);

  // username/статистика — только для чтения (заполняются verify-эндпоинтом и
  // счётчиками), поэтому берутся из живого config; token остаётся в draft, пока
  // не подтверждён «Проверить и подключить».
  const display = {
    telegram: { ...draft.telegram, enabled: config.telegram.enabled, handledCount: config.telegram.handledCount, avgRating: config.telegram.avgRating, username: config.telegram.username },
    instagram: {
      ...draft.instagram, enabled: config.instagram.enabled, handledCount: config.instagram.handledCount,
      avgRating: config.instagram.avgRating, username: config.instagram.username, expiresAt: config.instagram.expiresAt,
    },
    whatsapp: {
      ...draft.whatsapp, enabled: config.whatsapp.enabled, handledCount: config.whatsapp.handledCount,
      avgRating: config.whatsapp.avgRating, username: config.whatsapp.username,
    },
  };

  const handleDisconnectTelegram = async () => {
    await onDisconnectTelegram();
    updateChannel('telegram', 'token', '');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'telegram', label: 'Telegram' },
    { id: 'instagram', label: 'Instagram Direct' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'prompt', label: t('agents.tabPrompt') },
  ];
  const activeLabel = tabs.find(tab => tab.id === activeTab)!.label;
  const anyEnabled = display.telegram.enabled || display.instagram.enabled || display.whatsapp.enabled;

  return (
    <div
      className="fixed inset-0 z-[1000] flex animate-in items-center justify-center bg-[rgba(0,0,0,0.5)] p-4 fade-in duration-200 max-[767px]:items-end max-[767px]:p-0"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Фон карточки — жемчужный (--v-background), белыми остаются только
          внутренние секции: иначе белое на белом сливается. */}
      {/* На телефоне двухколоночная раскладка не работает: колонке каналов
          нужно 190px из 288 доступных, содержимому вкладки оставалось 98 и оно
          обрезалось. Ниже 768px модалка становится шитом снизу, а каналы —
          горизонтальным рельсом над содержимым. */}
      <div className="flex h-[628px] max-h-[calc(100vh-32px)] w-[920px] max-w-[calc(100vw-32px)] animate-in overflow-hidden rounded-[26px] bg-background font-sans text-foreground ring-1 ring-black/[0.06] fade-in duration-300 max-[900px]:w-[620px] max-[767px]:h-[92dvh] max-[767px]:max-h-[92dvh] max-[767px]:w-full max-[767px]:max-w-full max-[767px]:!flex-col max-[767px]:rounded-b-none"
        style={{ boxShadow: '0 50px 120px -30px rgba(26,26,26,0.45), 0 16px 48px -16px rgba(26,26,26,0.16)' }}
      >
        {/* ─── левая колонка: каналы ─── */}
        {/* Персиковый градиент колонки задан через токены темы, а не литералами:
            в тёмной теме та же заливка уходит в графит (--bg-card / --bg). */}
        <aside className="flex w-[268px] shrink-0 flex-col gap-1 border-r border-border bg-gradient-to-b from-[var(--tint-peach)] via-[var(--bg-card)] to-[var(--bg)] p-5 max-[1180px]:w-[228px] max-[900px]:w-[190px] max-[900px]:p-3 max-[767px]:w-full max-[767px]:!flex-row max-[767px]:gap-2 max-[767px]:overflow-x-auto max-[767px]:border-r-0 max-[767px]:border-b max-[767px]:p-2.5 max-[767px]:[scrollbar-width:none]">
          {/* Заголовок и подпись дублируют шапку модалки, а плитка модели —
              справочная: на телефоне обе только отнимают экран у формы. */}
          <div className="mb-6 flex items-start gap-3 px-1 max-[767px]:hidden">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#FCAE91] to-[#F9A08B] text-white shadow-[0_8px_18px_-10px_rgba(249,160,139,0.8)]">
              {ICONS.prompt}
            </div>
            <div className="min-w-0">
              <div className="text-[14.5px] font-extrabold leading-tight tracking-[-0.02em] text-foreground">{t('agents.modalTitle')}</div>
              <div className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{t('agents.modalSubtitle')}</div>
            </div>
          </div>

          {tabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left max-[767px]:w-auto max-[767px]:shrink-0 max-[767px]:whitespace-nowrap"
              >
                {active && (
                  <motion.span
                    layoutId="agentTabPill"
                    className="absolute inset-0 rounded-xl bg-card ring-1 ring-black/[0.05]"
                    style={{ boxShadow: '0 10px 24px -14px rgba(26,26,26,0.45)' }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className={cn(
                  'relative z-10 grid size-7 shrink-0 place-items-center rounded-lg transition-colors [&>svg]:size-4',
                  active ? 'bg-primary/15 text-[#DE8163]' : 'text-muted-foreground group-hover:text-foreground',
                )}>
                  {ICONS[tab.id]}
                </span>
                <span className={cn(
                  'relative z-10 flex-1 truncate text-[13px] font-bold transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                )}>
                  {tab.label}
                </span>
                {tab.id !== 'prompt' && (
                  <span className="relative z-10 shrink-0"><PulseRingSVG active={display[tab.id].enabled} size={7} /></span>
                )}
              </button>
            );
          })}

          <div className="mt-auto flex items-center gap-3 rounded-xl border border-border bg-card/70 px-3.5 py-3 max-[767px]:hidden">
            <div className="min-w-0 flex-1">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">{t('settings.model')}</div>
              <div className="mt-0.5 truncate text-[12.5px] font-extrabold text-foreground">{t('models.velora-3.5')}</div>
            </div>
            <WaveformSVG active={anyEnabled} width={40} height={20} barCount={9} />
          </div>
        </aside>

        {/* ─── правая колонка: содержимое вкладки ─── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-4 px-7 pt-6 pb-4 max-[767px]:px-4 max-[767px]:pt-4 max-[767px]:pb-3">
            <div className="text-[17px] font-extrabold tracking-[-0.02em] text-foreground">{activeLabel}</div>
            <button
              onClick={onClose}
              className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-6 max-[767px]:px-4 [scrollbar-color:rgba(249,160,139,0.3)_transparent] [scrollbar-width:thin]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                {activeTab === 'telegram' && (
                  <ChannelPane
                    label="Telegram"
                    icon={ICONS.telegram}
                    config={display.telegram}
                    connected={tgConnected}
                    gateReason={t('telegram.gateTooltip')}
                    statsPending={t('telegram.statsPending')}
                    stepsTitle={t('telegram.instructionTitle')}
                    steps={[1, 2, 3, 4].map(i => t(`telegram.instructionStep${i}`))}
                    onToggle={() => onToggleChannel('telegram')}
                    onOffHoursChange={v => updateChannel('telegram', 'offHoursOnly', v)}
                    connectArea={
                      <TelegramConnect
                        token={draft.telegram.token}
                        username={display.telegram.username}
                        connected={tgConnected}
                        isVerifying={isVerifyingTelegram}
                        onTokenChange={v => updateChannel('telegram', 'token', v)}
                        onVerify={() => onVerifyTelegram(draft.telegram.token.trim())}
                        onDisconnect={() => setConfirmDisconnect('telegram')}
                      />
                    }
                  />
                )}

                {activeTab === 'instagram' && (
                  <ChannelPane
                    label="Instagram Direct"
                    icon={ICONS.instagram}
                    config={display.instagram}
                    connected={igConnected}
                    gateReason={t('instagram.gateTooltip')}
                    statsPending={t('instagram.statsPending')}
                    stepsTitle={t('instagram.instructionTitle')}
                    steps={[1, 2, 3, 4].map(i => t(`instagram.instructionStep${i}`))}
                    showOffHours
                    onToggle={() => onToggleChannel('instagram')}
                    onOffHoursChange={v => updateChannel('instagram', 'offHoursOnly', v)}
                    connectArea={
                      <InstagramConnect
                        username={display.instagram.username}
                        expiresAt={display.instagram.expiresAt}
                        connected={igConnected}
                        isConnecting={isConnectingInstagram}
                        onConnect={onConnectInstagram}
                        onDisconnect={() => setConfirmDisconnect('instagram')}
                      />
                    }
                  />
                )}

                {activeTab === 'whatsapp' && (
                  <ChannelPane
                    label="WhatsApp"
                    icon={ICONS.whatsapp}
                    config={display.whatsapp}
                    connected={waConnected}
                    gateReason={t('whatsapp.gateTooltip')}
                    statsPending={t('whatsapp.statsPending')}
                    stepsTitle={t('whatsapp.instructionTitle')}
                    steps={[1, 2, 3].map(i => t(`whatsapp.instructionStep${i}`))}
                    showOffHours
                    onToggle={() => onToggleChannel('whatsapp')}
                    onOffHoursChange={v => updateChannel('whatsapp', 'offHoursOnly', v)}
                    connectArea={
                      <WhatsappConnect
                        number={display.whatsapp.username}
                        connected={waConnected}
                        isConnecting={isConnectingWhatsapp}
                        onConnect={onConnectWhatsapp}
                      />
                    }
                  />
                )}

                {activeTab === 'prompt' && (
                  <PromptPane
                    systemPrompt={draft.systemPrompt}
                    tone={draft.telegram.tone}
                    maxLength={draft.telegram.maxLength}
                    onPromptChange={prompt => setDraft(prev => ({ ...prev, systemPrompt: prompt }))}
                    onToneChange={tone => updateAllChannels('tone', tone)}
                    onMaxLengthChange={n => updateAllChannels('maxLength', n)}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-border px-7 py-4 max-[767px]:px-4 max-[767px]:pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button variant="ghost" onClick={onClose} className="h-10 rounded-xl px-4 text-[13.5px] font-semibold text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground">
              {t('common:buttons.cancel')}
            </Button>
            <Button onClick={() => onSave(draft)} disabled={isSaving || !canSave} className={CTA}>
              {isSaving ? t('common:buttons.saving') : t('common:buttons.save')}
            </Button>
          </div>
        </div>
      </div>

      {confirmDisconnect && (
        <ConfirmModal
          danger
          title={t(`${confirmDisconnect}.disconnectConfirmTitle`)}
          message={t(`${confirmDisconnect}.disconnectConfirmMessage`)}
          confirmText={t(`${confirmDisconnect}.disconnect`)}
          onConfirm={confirmDisconnect === 'telegram' ? handleDisconnectTelegram : onDisconnectInstagram}
          onClose={() => setConfirmDisconnect(null)}
        />
      )}
    </div>
  );
}
