import type { SubscriptionPackageInfo } from '../../api/studio';

/**
 * Материал карты — это уровень цены, а не украшение: самый доступный пакет
 * выпущен на жемчуге, следующий — в цвете студии, затем графит, самый
 * дорогой — чёрный оникс. Человек считывает «старше / младше» до того, как
 * прочтёт цену. Цвета материалов — в index.css (`.pass-art[data-material]`),
 * все выведены из цвета студии, а не из персика Velora.
 */
export type PassMaterial = 'pearl' | 'brand' | 'smoke' | 'onyx';

const LADDER: PassMaterial[] = ['pearl', 'brand', 'smoke', 'onyx'];

/** Материал каждого пакета по его месту в ряду цен. */
export function materialsOf(packages: SubscriptionPackageInfo[]): Map<number, PassMaterial> {
  const byPrice = [...packages].sort((a, b) => a.final_price - b.final_price);
  const top = Math.max(byPrice.length - 1, 1);
  return new Map(byPrice.map((plan, rank) => [
    plan.id,
    // Один пакет — сразу оникс: единственный выпуск и есть флагманский.
    byPrice.length === 1 ? 'onyx' : LADDER[Math.round((rank / top) * (LADDER.length - 1))],
  ]));
}
