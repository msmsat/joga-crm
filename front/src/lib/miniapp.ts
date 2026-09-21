/**
 * Ссылки в клиентское мини-приложение студии.
 *
 * Базовый адрес (`/s/<публичный код>`) считает сервер и отдаёт в настройках
 * студии (`miniapp_url`) — он зависит от окружения, а не от того, где открыт
 * кабинет. Здесь остаётся только хвост: куда именно внутри приложения ведёт
 * конкретная ссылка. Разбирает его `miniapp/src/lib/entry.ts` — параметры
 * должны совпадать с тем, что читает он.
 */
export function miniappLink(
  base: string,
  params: Record<string, string | number | null | undefined> = {},
): string {
  if (!base) return '';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  const tail = query.toString();
  // Базовая ссылка может уже нести свой `?` — адрес студии его не носит, но
  // склеивать через второй `?` нельзя ни при каких обстоятельствах.
  return tail ? `${base}${base.includes('?') ? '&' : '?'}${tail}` : base;
}

// Самопроверка (только dev-сборка): именно на ней держится то, что QR ведёт на
// конкретное занятие, а не «куда-то в приложение».
if (import.meta.env.DEV) {
  console.assert(miniappLink('https://a.app/s/k3', { lesson: 7 }) === 'https://a.app/s/k3?lesson=7', 'miniappLink: параметр');
  console.assert(miniappLink('https://a.app/s/k3?x=1', { pkg: 2 }) === 'https://a.app/s/k3?x=1&pkg=2', 'miniappLink: второй параметр');
  console.assert(miniappLink('https://a.app/s/k3', { tab: 'sched', staff: 42 }) === 'https://a.app/s/k3?tab=sched&staff=42', 'miniappLink: сотрудник');
  console.assert(miniappLink('https://a.app/s/k3', { lesson: undefined }) === 'https://a.app/s/k3', 'miniappLink: пустое не пишем');
  console.assert(miniappLink('', { lesson: 7 }) === '', 'miniappLink: без базы ссылки нет');
}
