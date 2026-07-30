import { useEffect, useState } from 'react';
import { authApi, clientsApi, staffApi } from '../api';
import type { ContactField } from '../api/auth/auth.types';

/**
 * Живая проверка занятости email/телефона: набрал — через 500 мс спросили сервер.
 * Пока `checking` — кнопку держим серой, `taken` — гасим её и показываем текст.
 *
 * Область (`scope`):
 * - `user`   — аккаунты продукта, свой не считается (онбординг, профиль);
 * - `staff`  — аккаунты продукта, `excludeId` = правимый сотрудник;
 * - `client` — клиенты текущей студии, `excludeId` = правимый клиент.
 *
 * Возвращает ДВА факта, потому что вопросы разные:
 * - `taken`    — контакт занят каким-то аккаунтом продукта;
 * - `inStudio` — этот человек уже работает в текущей студии (только scope 'staff').
 *
 * Форма ДОБАВЛЕНИЯ сотрудника обязана смотреть на `inStudio`: занятый контакт из
 * чужой студии — не ошибка, такого человека привяжут (ROADMAP_ACCOUNTS, решение 8).
 * Формы ПРАВКИ (карточка сотрудника, контакты владельца) смотрят на `taken`:
 * там контакт переписывается, и сервер ответит 409.
 *
 * Это подсказка, а не барьер: барьер — 409 от сервера на записи.
 */
export type ContactScope = 'user' | 'staff' | 'client';

const CHECK: Record<ContactScope, (field: ContactField, value: string, excludeId?: number) => Promise<{ taken: boolean; in_studio?: boolean }>> = {
  user:   (field, value) => authApi.checkContact(field, value),
  staff:  staffApi.checkContact,
  client: clientsApi.checkContact,
};

export function useContactCheck(
  scope: ContactScope,
  field: ContactField,
  value: string,
  options: { excludeId?: number; enabled?: boolean } = {},
) {
  const { excludeId, enabled = true } = options;
  const trimmed = value.trim();
  // Пустой ключ = проверять нечего. Ответ храним вместе с ключом, поэтому «проверяем»
  // выводится, а не хранится отдельным состоянием: ответ на старое значение не в счёт.
  const key = enabled && trimmed ? `${scope}|${field}|${trimmed}|${excludeId ?? ''}` : '';
  const [answer, setAnswer] = useState({ key: '', taken: false, inStudio: false });

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(async () => {
      try {
        const { taken, in_studio } = await CHECK[scope](field, trimmed, excludeId);
        setAnswer({ key, taken, inStudio: !!in_studio });
      } catch {
        // Сеть/права отвалились — не блокируем форму, барьером остаётся сервер.
        setAnswer({ key, taken: false, inStudio: false });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [key, scope, field, trimmed, excludeId]);

  const settled = answer.key === key;
  return {
    taken: settled && answer.taken,
    // Человек уже в этой студии — настоящий конфликт при добавлении.
    inStudio: settled && answer.inStudio,
    checking: !!key && !settled,
  };
}
