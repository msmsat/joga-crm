import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../../../../components/ui/index';
import { Switch } from '@/components/ui-shadcn/switch';
import { cn } from '@/lib/utils';
import PulseRingSVG from '../animations/PulseRingSVG';
import { SECTION } from './ConnectAreas';
import type { ChannelAgentConfig } from '../../types';

interface ChannelPaneProps {
  label: string;
  icon: React.ReactNode;
  config: ChannelAgentConfig;
  connected: boolean;
  gateReason: string;
  statsPending: string;
  connectArea: React.ReactNode;
  stepsTitle: string;
  steps: string[];
  showOffHours?: boolean;
  onToggle: () => void;
  onOffHoursChange: (value: boolean) => void;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[#A3C9A8]/30 bg-[#A3C9A8]/10 px-4 py-3 text-center">
      <div className="text-[20px] font-extrabold tracking-[-0.02em] text-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

// Содержимое вкладки канала: тумблер + подключение + статистика + инструкция.
// Тон и лимит ответа здесь не живут — они общие для всех каналов и вынесены
// на вкладку «Системный промпт» (см. PromptPane).
export default function ChannelPane({
  label, icon, config, connected, gateReason, statsPending, connectArea,
  stepsTitle, steps, showOffHours, onToggle, onOffHoursChange,
}: ChannelPaneProps) {
  const { t } = useTranslation('ai');
  const offHoursId = `offHours-${label.replace(/\s+/g, '')}`;

  const toggle = (
    <Switch
      size="lg"
      checked={config.enabled}
      onCheckedChange={onToggle}
      disabled={!connected}
      className="data-[state=checked]:bg-[#A3C9A8]"
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 rounded-2xl border border-primary/25 bg-gradient-to-br from-[#FFF3EC] to-white p-5 shadow-[0_2px_10px_-6px_rgba(26,26,26,0.10)]">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#FCAE91] to-[#F9A08B] text-white shadow-[0_8px_18px_-10px_rgba(249,160,139,0.8)]">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[16px] font-extrabold tracking-[-0.02em] text-foreground">{label}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <PulseRingSVG active={config.enabled} size={8} />
            <span className={cn('text-[12px] font-semibold', config.enabled ? 'text-[#5A8A62]' : 'text-muted-foreground')}>
              {config.enabled ? t('common:status.active') : t('agents.statusDisabled')}
            </span>
          </div>
        </div>
        <div className="ml-auto shrink-0">
          {connected ? toggle : <Tooltip label={gateReason}>{toggle}</Tooltip>}
        </div>
      </div>

      {connectArea}

      {config.enabled && (
        config.handledCount > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t('agents.statHandled')} value={config.handledCount} />
            <Stat label={t('agents.statRating')} value={`${config.avgRating.toFixed(1)} ★`} />
          </div>
        ) : (
          <div className="text-center text-[12px] font-medium text-muted-foreground">{statsPending}</div>
        )
      )}

      {showOffHours && (
        <label htmlFor={offHoursId} className={cn(SECTION, 'flex cursor-pointer items-center justify-between gap-4 py-4')}>
          <span className="text-[13.5px] font-semibold text-foreground">{t('agents.offHoursLabel')}</span>
          <Switch id={offHoursId} size="lg" checked={config.offHoursOnly} onCheckedChange={onOffHoursChange} />
        </label>
      )}

      {!connected && (
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.055] p-5">
          <div className="mb-3 text-[13px] font-bold text-foreground">{stepsTitle}</div>
          <ol className="flex flex-col gap-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-[12.5px] leading-relaxed text-muted-foreground">
                <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-primary/20 text-[10.5px] font-extrabold text-[#C2704F]">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
