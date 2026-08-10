import { AnimatePresence, motion } from 'framer-motion';

/**
 * Свет в комнате, окрашенный фирменным цветом студии.
 *
 * Приём из плееров: интерфейс подхватывает оттенок текущей обложки, и экран
 * перестаёт быть белым листом. Держится на очень низкой прозрачности — это
 * освещение, а не заливка, жемчужный фон ДС должен читаться сквозь него.
 *
 * Слоёв два, потому что один купол по центру читается как градиент в баннере:
 * верхний — общий свет сверху, нижний — отражённое пятно слева, сдвинутое от
 * оси. Асимметрия и есть разница между «освещено» и «залито».
 *
 * Зерно только на десктопе: на большой площади ровная заливка выдаёт цифру,
 * а в вебвью Telegram полноэкранная текстура — лишняя работа на каждый кадр.
 */
export default function AmbientBackdrop({ tint }: { tint: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden dt:h-[640px]">
      <AnimatePresence mode="sync">
        <motion.div
          key={tint}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 120% 70% at 50% -15%, ${tint}2E 0%, ${tint}0F 45%, transparent 75%)`,
            }}
          />

          <div
            className="absolute inset-0 hidden dt:block"
            style={{
              background: `radial-gradient(ellipse 55% 60% at 12% 22%, ${tint}1A 0%, transparent 70%)`,
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Зерно: перекрывает бандинг градиента и снимает с фона пластиковость. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden opacity-[0.035] mix-blend-multiply dark:opacity-[0.05] dark:mix-blend-screen dt:block"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
