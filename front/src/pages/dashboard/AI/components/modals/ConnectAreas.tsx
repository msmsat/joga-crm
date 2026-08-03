import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui-shadcn/button';
import { Input } from '@/components/ui-shadcn/input';

// Блоки подключения канала (токен / OAuth / номер) — то, что раньше жило
// в AgentSetupModal как три JSX-переменные. Стиль общий: секция-карточка,
// внутри либо поле с CTA, либо зелёный бейдж подключённого аккаунта.
// Белая карточка «плавает» на жемчужном фоне модалки — отсюда мягкая тень:
// без неё белое на белом сливалось в кашу.
export const SECTION = 'rounded-2xl border border-border bg-card p-5 shadow-[0_2px_10px_-6px_rgba(26,26,26,0.10)]';
export const SECTION_LABEL = 'mb-3 block text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground';
export const CTA = 'h-10 rounded-xl bg-gradient-to-b from-[#FCAE91] to-[#F9A08B] px-5 text-[13.5px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(249,160,139,0.85)] hover:from-[#FCAE91] hover:to-[#F9A08B] hover:brightness-[1.03]';
const LINK_BTN = 'text-[12.5px] font-bold text-destructive transition-opacity hover:opacity-70';

export const TG_TOKEN_RE = /^\d+:[\w-]{30,}$/;

function ConnectedBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#A3C9A8]/40 bg-[#A3C9A8]/12 px-3.5 py-1.5 text-[12.5px] font-bold text-[#5A8A62]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      {children}
    </span>
  );
}

export function TelegramConnect({
  token, username, connected, isVerifying, onTokenChange, onVerify, onDisconnect,
}: {
  token: string;
  username: string;
  connected: boolean;
  isVerifying: boolean;
  onTokenChange: (v: string) => void;
  onVerify: () => void;
  onDisconnect: () => void;
}) {
  const { t } = useTranslation('ai');
  const touched = token.trim().length > 0;
  const valid = TG_TOKEN_RE.test(token.trim());

  return (
    <section className={SECTION}>
      <label className={SECTION_LABEL}>{t('telegram.tokenLabel')}</label>
      {connected && username ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ConnectedBadge>@{username}</ConnectedBadge>
          <span className="text-[12.5px] font-semibold text-muted-foreground">{t('common:status.connected')}</span>
          <button type="button" className={`ml-auto ${LINK_BTN}`} onClick={onDisconnect}>
            {t('telegram.disconnect')}
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-2.5">
          <div className="flex-1">
            <Input
              value={token}
              onChange={e => onTokenChange(e.target.value)}
              placeholder={t('telegram.tokenPlaceholder')}
              aria-invalid={touched && !valid}
              className="h-10 rounded-xl font-mono text-[13px] tracking-tight md:text-[13px]"
            />
            {touched && !valid && (
              <p className="mt-1.5 text-[11.5px] font-semibold text-destructive">{t('telegram.tokenInvalidFormat')}</p>
            )}
          </div>
          <Button onClick={onVerify} disabled={!valid || isVerifying} className={CTA}>
            {isVerifying && <Loader2 className="size-4 animate-spin" />}
            {t('telegram.verifyButton')}
          </Button>
        </div>
      )}
    </section>
  );
}

export function InstagramConnect({
  username, expiresAt, connected, isConnecting, onConnect, onDisconnect,
}: {
  username: string;
  expiresAt?: string | null;
  connected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const { t, i18n } = useTranslation('ai');

  return (
    <section className={SECTION}>
      <label className={SECTION_LABEL}>Instagram</label>
      {connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <ConnectedBadge>@{username}</ConnectedBadge>
          {expiresAt && (
            <span className="text-[12.5px] text-muted-foreground">
              {t('instagram.expiresUntil', { date: new Intl.DateTimeFormat(i18n.language).format(new Date(expiresAt)) })}
            </span>
          )}
          <button type="button" className={`ml-auto ${LINK_BTN}`} onClick={onDisconnect}>
            {t('instagram.disconnect')}
          </button>
        </div>
      ) : (
        <Button onClick={onConnect} disabled={isConnecting} className={CTA}>
          {isConnecting && <Loader2 className="size-4 animate-spin" />}
          {t('instagram.connectButton')}
        </Button>
      )}
    </section>
  );
}

// Номер один на студию (он же канал Уведомлений), но подключить его можно и
// отсюда — Embedded Signup: окно Meta вместо ручного токена и Phone Number ID.
export function WhatsappConnect({
  number, connected, isConnecting, onConnect,
}: {
  number: string;
  connected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
}) {
  const { t } = useTranslation('ai');

  return (
    <section className={SECTION}>
      <label className={SECTION_LABEL}>{t('whatsapp.numberLabel')}</label>
      {connected ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ConnectedBadge>{number}</ConnectedBadge>
          <span className="text-[12.5px] font-semibold text-muted-foreground">{t('common:status.connected')}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={onConnect} disabled={isConnecting} className={CTA}>
            {isConnecting && <Loader2 className="size-4 animate-spin" />}
            {t('whatsapp.connectButton')}
          </Button>
          <Link to="/dashboard/notifications" className="text-[12.5px] font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t('whatsapp.connectLink')}
          </Link>
        </div>
      )}
    </section>
  );
}
