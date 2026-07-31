import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui-shadcn/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui-shadcn/select';
import { SECTION } from './ConnectAreas';
import type { AgentTone } from '../../types';

const TONES: AgentTone[] = ['friendly', 'formal', 'neutral'];

interface PromptPaneProps {
  systemPrompt: string;
  tone: AgentTone;
  maxLength: number;
  onPromptChange: (value: string) => void;
  onToneChange: (value: AgentTone) => void;
  onMaxLengthChange: (value: number) => void;
}

// Личность агента в одном месте: инструкция + тон + лимит ответа. Тон и лимит
// общие для Telegram/Instagram/WhatsApp (на сервере поля per-channel, «Сохранить»
// пишет одно значение во все три — см. AgentSetupModal).
export default function PromptPane({
  systemPrompt, tone, maxLength, onPromptChange, onToneChange, onMaxLengthChange,
}: PromptPaneProps) {
  const { t } = useTranslation('ai');
  const lengthInvalid = maxLength < 50 || maxLength > 4000;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border border-primary/20 border-l-[3px] border-l-primary bg-primary/[0.055] p-4">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="1.8" strokeLinecap="round" className="mt-px shrink-0">
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
        </svg>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t('agents.promptHint')}</p>
      </div>

      <div className="relative">
        <textarea
          value={systemPrompt}
          onChange={e => onPromptChange(e.target.value)}
          maxLength={2000}
          placeholder={t('agents.promptPlaceholder')}
          className="h-[188px] w-full resize-none rounded-2xl border border-input bg-card p-4 pb-9 text-[13.5px] leading-relaxed text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-[3px] focus:ring-ring/20"
        />
        <span className="pointer-events-none absolute bottom-3.5 right-4 text-[11px] font-medium text-muted-foreground/70">
          {t('agents.promptCount', { count: systemPrompt.length })}
        </span>
      </div>

      <section className={SECTION}>
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">{t('agents.styleTitle')}</span>
          <span className="text-[11px] font-medium text-muted-foreground/70">· {t('agents.styleAllChannels')}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-[12px] font-semibold text-muted-foreground">{t('agents.toneLabel')}</label>
            <Select value={tone} onValueChange={v => onToneChange(v as AgentTone)}>
              <SelectTrigger className="h-10 w-full rounded-xl text-[13.5px] font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[1200] rounded-xl">
                {TONES.map(v => (
                  <SelectItem key={v} value={v} className="text-[13.5px]">{t(`agents.tone.${v}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-[12px] font-semibold text-muted-foreground">{t('agents.maxLengthLabel')}</label>
            <Input
              type="number"
              min={50}
              max={4000}
              step={50}
              value={String(maxLength)}
              onChange={e => onMaxLengthChange(Number(e.target.value))}
              aria-invalid={lengthInvalid}
              className="h-10 rounded-xl text-[13.5px] font-semibold md:text-[13.5px]"
            />
            {lengthInvalid && (
              <p className="mt-1.5 text-[11.5px] font-semibold text-destructive">{t('agents.maxLengthError')}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
