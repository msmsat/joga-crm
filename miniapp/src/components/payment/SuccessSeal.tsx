import { useEffect } from 'react';
import { haptic } from '../../hooks/useTelegram';
import { rosette } from '../pass/guilloche';
import styles from './SuccessSeal.module.css';

/**
 * Момент, когда печать касается фарфора. От него отсчитано всё остальное:
 * волна света, отсвет в камне, галочка, текст и чек (`--impact` в CSS), и в
 * этот же миг телефон отвечает тактильно. Одна точка отсчёта — иначе волна,
 * отклик и удар расходятся, и глаз читает это как рывок.
 */
export const IMPACT_MS = 620;

// Гравировка лица печати — тот же гильош, что на картах абонементов: печать
// выдана той же «типографией». Одна частота без второй гармоники — ровная
// банкнотная плетёнка; с двумя волнами узор путался в проволоку.
const ENGRAVING = rosette({ cx: 60, cy: 60, r: 41.5, a: 5.5, b: 0, k: 14, m: 1, copies: 8, points: 336 }).join('');

// Пыль, выдавленная из-под печати: уходит по радиусу и гаснет. Углы и
// дальность заданы заранее — постановка одинакова на каждом показе.
const MOTES = [
  [-158, 'far'], [-128, 'near'], [-96, 'mid'], [-62, 'far'], [-34, 'near'],
  [-8, 'mid'], [22, 'far'], [154, 'mid'], [184, 'near'], [208, 'far'],
] as const;

export default function SuccessSeal() {
  useEffect(() => {
    // Без анимации удара нет — отклик сразу, вместе с появлением экрана.
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => haptic.success(), calm ? 0 : IMPACT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={styles.stage} aria-hidden="true">
      <div className={styles.rig}>
        <span className={styles.glow} />
        <span className={styles.wave} />
        <span className={styles.wave} />
        <span className={styles.bed} />
        <span className={styles.motes}>
          {MOTES.map(([angle, reach], index) => (
            <span key={index} className={styles.mote} style={{ transform: `rotate(${angle}deg)` }}>
              <i className={styles[reach]} style={{ animationDelay: `calc(var(--impact) + ${(index % 4) * 24}ms)` }} />
            </span>
          ))}
        </span>
        <span className={styles.shadow} />
        <span className={styles.seal}>
          <span className={styles.face}>
            <span className={styles.ember} />
            <span className={styles.rosette}>
              <svg viewBox="0 0 120 120" fill="none">
                <path d={ENGRAVING} />
                <circle cx="60" cy="60" r="55.5" />
                <circle cx="60" cy="60" r="53" />
              </svg>
            </span>
            <span className={styles.boss} />
            <span className={styles.check}>
              <i className={styles.legShort} />
              <i className={styles.legLong} />
            </span>
            <span className={styles.sheen} />
          </span>
        </span>
      </div>
    </div>
  );
}
