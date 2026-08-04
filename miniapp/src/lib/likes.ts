const KEY = 'velora.liked';

/**
 * Избранные студии.
 *
 * ponytail: живут на устройстве — эндпоинта «избранное клиента» в CRM нет.
 * Заменяется на запрос, когда появится; формат (массив id) переживёт переезд.
 */
export function getLiked(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

export function toggleLiked(id: number): number[] {
  const liked = getLiked();
  const next = liked.includes(id) ? liked.filter((x) => x !== id) : [...liked, id];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
