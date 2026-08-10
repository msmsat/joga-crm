import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import type { LoyaltyLevelInfo } from '../../api/loyalty';

/**
 * Лестница уровней студии.
 *
 * Показана целиком, включая недостигнутые: смысл уровня в том, что видно, куда
 * идти. Пройденные заливаются своим цветом, будущие остаются контуром — разница
 * читается без единой подписи «досягнуто».
 *
 * Пороги приходят с сервера уже отформатированными в валюте студии
 * (`min_threshold_str`): второй раз форматировать деньги на клиенте нельзя,
 * иначе где-то однажды разойдётся разделитель разрядов.
 */
export default function LevelLadder({ levels }: { levels: LoyaltyLevelInfo[] }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto px-5 pb-1 dt:flex-wrap dt:overflow-visible">
      {levels.map((level, i) => (
        <motion.div
          key={level.name}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'flex min-w-[132px] shrink-0 flex-col gap-2.5 rounded-[18px] px-4 py-3.5 dt:min-w-[152px]',
            level.is_current ? 'bg-card shadow-lift' : 'bg-card shadow-soft',
            !level.reached && 'opacity-55',
          )}
        >
          <span
            className={cn('h-1.5 w-8 shrink-0 rounded-full', !level.reached && 'opacity-45')}
            style={{ background: level.color }}
          />

          <span className="text-[14px] font-extrabold tracking-[-0.02em] text-card-foreground">
            {level.name}
          </span>

          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
            {level.min_threshold_str}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
