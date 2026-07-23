import styles from '../../Loyalty.module.css';

// Скелетон сводки (задача 8) — тот же каркас, что ProgressHeader, без чисел до загрузки.
export default function ProgressHeaderSkeleton() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '16px',
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px 24px', marginBottom: '24px',
    }}>
      <div className={styles.skel} style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div className={styles.skel} style={{ width: '220px', height: '13px', marginBottom: '8px' }} />
        <div className={styles.skel} style={{ width: '320px', height: '12px' }} />
      </div>
    </div>
  );
}
