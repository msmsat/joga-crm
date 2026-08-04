import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import { useTelegram } from '../../hooks/useTelegram';

interface LanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FLAG_VIEWBOX = '0 0 24 16';

function FlagUA() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="8" fill="#0057B7" />
      <rect y="8" width="24" height="8" fill="#FFD700" />
    </svg>
  );
}

function FlagGB() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="16" fill="#00247D" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#fff" strokeWidth="3" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#CF142B" strokeWidth="1.4" />
      <path d="M12 0V16M0 8H24" stroke="#fff" strokeWidth="5" />
      <path d="M12 0V16M0 8H24" stroke="#CF142B" strokeWidth="2.4" />
    </svg>
  );
}

function FlagCZ() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="8" fill="#fff" />
      <rect y="8" width="24" height="8" fill="#D7141A" />
      <path d="M0 0L12 8L0 16Z" fill="#11457E" />
    </svg>
  );
}

function FlagRU() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="5.33" fill="#fff" />
      <rect y="5.33" width="24" height="5.33" fill="#0039A6" />
      <rect y="10.67" width="24" height="5.33" fill="#D52B1E" />
    </svg>
  );
}

const LANGUAGES = [
  { code: 'uk', name: 'Українська', flag: <FlagUA /> },
  { code: 'en', name: 'English', flag: <FlagGB /> },
  { code: 'cz', name: 'Čeština', flag: <FlagCZ /> },
  { code: 'ru', name: 'Русский', flag: <FlagRU /> },
];

export default function LanguageModal({ isOpen, onClose }: LanguageModalProps) {
  const { i18n, t } = useTranslation();
  const { tg } = useTelegram();

  const current = i18n.language || 'uk';

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code);
    if (tg) tg.HapticFeedback.selectionChanged();
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      kicker={t('languageModal.tag')}
      title={t('profile.language', 'Мова')}
      subtitle={t('languageModal.sub')}
    >
      <div className="flex flex-col gap-2">
        {LANGUAGES.map((lang, i) => {
          // Детектор языка отдаёт и «en-US», поэтому сверяем по префиксу.
          const isSelected = current === lang.code || current.startsWith(`${lang.code}-`);

          return (
            <motion.button
              key={lang.code}
              type="button"
              onClick={() => handleSelect(lang.code)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.985 }}
              className={`flex items-center gap-3.5 rounded-[18px] px-4 py-4 text-left transition ${
                isSelected ? 'bg-brand/10 ring-1 ring-brand/45' : 'bg-background'
              }`}
            >
              <span className="flex h-5 w-7 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-foreground/10">
                {lang.flag}
              </span>
              <span
                className={`flex-1 text-[15px] tracking-[-0.01em] ${
                  isSelected ? 'font-extrabold text-foreground' : 'font-semibold text-foreground/80'
                }`}
              >
                {lang.name}
              </span>

              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full ${
                  isSelected ? 'bg-brand' : 'ring-1 ring-foreground/15'
                }`}
              >
                {isSelected && (
                  <motion.svg
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--v-brand-foreground)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </motion.svg>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
    </Sheet>
  );
}
