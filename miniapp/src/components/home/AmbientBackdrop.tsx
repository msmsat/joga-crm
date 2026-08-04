import { AnimatePresence, motion } from 'framer-motion';

/**
 * Цветное свечение вверху страницы, окрашенное выбранной студией.
 *
 * Приём из плееров: интерфейс подхватывает оттенок текущей обложки, и лента
 * перестаёт быть просто списком — экран целиком реагирует на выбор. Пятно
 * держится на очень низкой прозрачности: это освещение, а не заливка,
 * жемчужный фон ДС должен читаться сквозь него.
 */
export default function AmbientBackdrop({ tint }: { tint: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
      <AnimatePresence mode="sync">
        <motion.div
          key={tint}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 120% 70% at 50% -15%, ${tint}2E 0%, ${tint}0F 45%, transparent 75%)`,
          }}
        />
      </AnimatePresence>
    </div>
  );
}
