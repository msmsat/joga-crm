import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import { EmptyState } from '../ui/EmptyState';
import { useTelegram } from '../../hooks/useTelegram';
import type { StudioInfo } from '../../api/studio';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Студия, чей это кабинет: связываться клиент будет с ней, а не с Velora. */
  studio: StudioInfo | null;
}

type Channel = {
  key: string;
  label: string;
  value: string;
  href: string;
  icon: React.ReactNode;
};

/** Голый домен из настроек («velora.studio») ссылкой сам по себе не является. */
const asUrl = (website: string) =>
  /^https?:\/\//i.test(website) ? website : `https://${website}`;

/** «https://velora.studio/» → «velora.studio» — в строке нужен адрес, не URL. */
const prettyHost = (website: string) =>
  website.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

/**
 * Поддержка — это контакты студии, а не сообщение «мы на связи».
 *
 * Раньше здесь стоял текст-заглушка и кнопка, которая просто закрывала лист:
 * человек, у которого проблема, не получал ни телефона, ни почты. Теперь лист
 * показывает то, что студия заполнила в Настройках → Общие, и каждая строка
 * сразу действие: телефон звонит (`tel:`), почта открывает письмо (`mailto:`),
 * сайт уходит во внешний браузер.
 *
 * Незаполненные контакты не показываются вовсе, а если студия не оставила ни
 * одного — честное пустое состояние. Пустая строка «Телефон: —» бесполезна
 * ровно так же, как прежняя заглушка.
 */
export default function SupportModal({ isOpen, onClose, studio }: SupportModalProps) {
  const { t } = useTranslation();
  const { tg, vibrateLight } = useTelegram();

  const channels: Channel[] = [];

  if (studio?.phone) {
    channels.push({
      key: 'phone',
      label: t('supportModal.phone'),
      value: studio.phone,
      href: `tel:${studio.phone.replace(/[^\d+]/g, '')}`,
      icon: (
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
      ),
    });
  }

  if (studio?.email) {
    channels.push({
      key: 'email',
      label: t('supportModal.email'),
      value: studio.email,
      href: `mailto:${studio.email}`,
      icon: (
        <>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 6l-10 7L2 6" />
        </>
      ),
    });
  }

  if (studio?.website) {
    channels.push({
      key: 'website',
      label: t('supportModal.website'),
      value: prettyHost(studio.website),
      href: asUrl(studio.website),
      icon: (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </>
      ),
    });
  }

  // tel: и mailto: отдаём телеграмному клиенту его же методом: во встроенном
  // вебвью обычный переход по такой ссылке молча ничего не делает.
  const openChannel = (href: string) => {
    vibrateLight();
    if (tg?.openLink && href.startsWith('http')) tg.openLink(href);
    else window.location.assign(href);
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      kicker={t('supportModal.tag')}
      title={t('supportModal.title')}
      subtitle={studio?.name ? t('supportModal.sub', { studio: studio.name }) : undefined}
    >
      {channels.length === 0 ? (
        <EmptyState
          size="sm"
          title={t('supportModal.no_contacts')}
          hint={t('supportModal.no_contacts_hint')}
          icon={
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {channels.map((channel, i) => (
            <motion.button
              key={channel.key}
              type="button"
              onClick={() => openChannel(channel.href)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.985 }}
              className="flex items-center gap-3.5 rounded-[18px] bg-background px-4 py-3.5 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/12">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--v-brand)"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[18px] w-[18px]"
                >
                  {channel.icon}
                </svg>
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                  {channel.label}
                </span>
                <span className="mt-1 block truncate text-[14.5px] font-extrabold tracking-[-0.015em] text-foreground">
                  {channel.value}
                </span>
              </span>

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--v-brand)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </motion.button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
