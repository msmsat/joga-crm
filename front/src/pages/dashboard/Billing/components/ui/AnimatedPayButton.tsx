import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import styles from './AnimatedPayButton.module.css';

interface Props {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  loading?: boolean;
  disabled?: boolean;
}

const SPARKS = [8, 19, 32, 45, 58, 71, 83, 94];

export default function AnimatedPayButton({
  children, onClick, className = '', loading = false, disabled = false,
}: Props) {
  const inactive = disabled || loading;

  return (
    <div className={`${styles.slot} ${className}`} data-inactive={inactive || undefined}>
      <span className={styles.aura} aria-hidden="true" />
      <span className={styles.halo} aria-hidden="true" />
      <button type="button" className={styles.button} onClick={onClick} disabled={inactive} aria-busy={loading || undefined}>
        <span className={styles.scene} aria-hidden="true">
          <span className={styles.flow} />
          <span className={`${styles.flow} ${styles.flowSecond}`} />
          <span className={styles.shimmer} />
          {SPARKS.map((left, index) => (
            <span
              key={left}
              className={styles.spark}
              style={{
                left: `${left}%`,
                '--delay': `${index * -0.53}s`,
                '--duration': `${2.6 + (index % 3) * 0.5}s`,
                '--drift': `${index % 2 ? 28 : -24}px`,
              } as CSSProperties}
            />
          ))}
        </span>
        <span className={styles.label}>
          <span>{children}</span>
          {loading
            ? <LoaderCircle size={18} className={styles.spinner} aria-hidden="true" />
            : <ArrowUpRight size={19} className={styles.arrow} strokeWidth={2} aria-hidden="true" />}
        </span>
      </button>
    </div>
  );
}
