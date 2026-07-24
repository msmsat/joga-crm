import i18n from '../i18n';

// Общий хелпер для истории чатов Velora AI (эпик AI-4, задача 2) — одна
// реализация на страницу AI, дровер и их списки сессий, вместо ru-RU-хардкодов.

/** «5 минут назад» / «5 minutes ago»; старше суток — дата («22 июл» / «Jul 22»). */
export function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffMin < 1440) return rtf.format(-Math.round(diffMin / 60), 'hour');
  return new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** Время сообщения в чате: «14:32». */
export function formatMessageTime(iso: string): string {
  return new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
