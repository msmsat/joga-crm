import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const { t } = useTranslation();

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      kicker={t('supportModal.tag')}
      title={t('supportModal.title')}
      footer={<SheetAction onClick={onClose}>{t('supportModal.button')}</SheetAction>}
    >
      <div className="flex flex-col items-center pt-2 text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 20, delay: 0.1 }}
          className="relative flex h-[86px] w-[86px] items-center justify-center rounded-full bg-brand/12"
        >
          {/* Второе кольцо дышит — «мы на связи», а не статичная иконка. */}
          <motion.span
            animate={{ scale: [1, 1.14, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-full ring-1 ring-brand/40"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--v-brand)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-9 w-9"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </motion.div>

        <p className="mt-6 max-w-[19rem] text-[14px] font-medium leading-relaxed text-muted-foreground">
          {t('supportModal.description')}
        </p>
      </div>
    </Sheet>
  );
}
