import { useState, useEffect, useCallback } from 'react';
import { clientsApi } from '../../../../api/clients';
import type { ClientData } from '../types';
import { mapListItem } from '../utils/mapClient';

const PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Серверный список клиентов: пагинация «Загрузить ещё», дебаунс поиска,
 * фильтр по категории. total/offset приходят из обёртки Page (задача 9).
 */
export function useClientsList() {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [rawSearch, setRawSearch] = useState('');   // то, что печатает пользователь
  const [search, setSearch] = useState('');         // дебаунсенное значение → уходит на сервер
  const [category, setCategory] = useState<string>(''); // ключ категории ('' | 'all' | 'vip' | ...)

  // Дебаунс: ждём паузу после последней буквы, а не шлём запрос на каждый символ.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(rawSearch.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawSearch]);

  // Первая порция — при смене поиска/категории.
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const page = await clientsApi.getList({
        search: search || undefined,
        category: category && category !== 'all' ? category : undefined,
        offset: 0,
        limit: PAGE_SIZE,
      });
      setClients(page.items.map(mapListItem));
      setTotal(page.total);
    } finally {
      setIsLoading(false);
    }
  }, [search, category]);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(async () => {
    setIsLoading(true);
    try {
      const page = await clientsApi.getList({
        search: search || undefined,
        category: category && category !== 'all' ? category : undefined,
        offset: clients.length,
        limit: PAGE_SIZE,
      });
      setClients(prev => [...prev, ...page.items.map(mapListItem)]);
      setTotal(page.total);
    } finally {
      setIsLoading(false);
    }
  }, [search, category, clients.length]);

  // Точечные апдейты локального списка без перезагрузки с сервера.
  const patchLocal = useCallback((updater: (prev: ClientData[]) => ClientData[]) => {
    setClients(updater);
  }, []);

  const hasMore = clients.length < total;

  // Оптимистично корректируем total, чтобы hasMore не «залипал» после удаления.
  const removeLocal = useCallback((id: number) => {
    setClients(prev => prev.filter(c => c.id !== id));
    setTotal(t => Math.max(0, t - 1));
  }, []);

  return {
    clients, total, hasMore, isLoading,
    rawSearch, setRawSearch,
    category, setCategory,
    reload: load, loadMore,
    patchLocal, removeLocal,
  };
}
