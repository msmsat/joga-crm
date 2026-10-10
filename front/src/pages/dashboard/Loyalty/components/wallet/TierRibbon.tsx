import { useQuery } from '@tanstack/react-query';
import { loyaltyApi } from '../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../api/queryKeys';
import s from './Wallet.module.css';

// Лента уровней на главной карте: доля держателей карт на каждой ступени —
// цветом уровня, как полосы фольги. Те же запросы и ключи, что у
// «Распределения по уровням» в сводке, — кэш общий, второго похода нет.
export default function TierRibbon() {
  const { data: levels = [] } = useQuery({ queryKey: queryKeys.loyaltyLevels, queryFn: () => loyaltyApi.getLevels() });
  const { data: cards = [] } = useQuery({ queryKey: queryKeys.loyaltyCards, queryFn: () => loyaltyApi.getCards() });

  if (levels.length === 0) return null;
  const rows = levels.map(lvl => ({ ...lvl, count: cards.filter(c => c.level_id === lvl.id).length }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className={s.ribbon}>
      <div className={s.ribbonBar}>
        {rows.map((r, i) => (
          // Пустая ступень остаётся тонкой чертой, а не исчезает: лестница
          // уровней читается целиком, даже пока на верхних никого нет.
          <span
            key={r.id}
            className={s.ribbonSeg}
            style={{ background: r.color, flexGrow: total ? Math.max(r.count, total * 0.04) : 1, animationDelay: `${0.5 + i * 0.08}s` }}
          />
        ))}
      </div>
      <div className={s.ribbonLegend}>
        {rows.map(r => (
          <span key={r.id} className={s.ribbonItem}>
            <i style={{ background: r.color }} />
            <span className={s.ribbonName}>{r.name}</span>
            <b>{r.count}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
