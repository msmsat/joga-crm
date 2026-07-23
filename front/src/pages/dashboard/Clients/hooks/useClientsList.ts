import { useState, useEffect, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '../../../../api/clients';
import type { ClientCreate, ClientUpdate } from '../../../../api/clients/clients.types';
import { loyaltyApi } from '../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../api/queryKeys';
import { mapListItem } from '../utils/mapClient';
import type { EventFilterTab } from '../types';

const PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Серверный список клиентов: пагинация «Загрузить ещё», дебаунс поиска,
 * фильтр по категории. Кэш и фоновое обновление — через TanStack Query,
 * тот же паттерн, что в Каталоге (useCatalogList.ts).
 */
export function useClientsList() {
  const [rawSearch, setRawSearch] = useState('');   // то, что печатает пользователь
  const [search, setSearch] = useState('');         // дебаунсенное значение → уходит на сервер
  const [category, setCategory] = useState<string>(''); // ключ категории ('' | 'all' | 'vip' | ...)

  // Дебаунс: ждём паузу после последней буквы, а не шлём запрос на каждый символ.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(rawSearch.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawSearch]);

  const normalizedCategory = category && category !== 'all' ? category : '';

  const {
    data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.clients(search, normalizedCategory),
    queryFn: ({ pageParam }) => clientsApi.getList({
      search: search || undefined,
      category: normalizedCategory || undefined,
      offset: pageParam,
      limit: PAGE_SIZE,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const clients = useMemo(
    () => (data?.pages ?? []).flatMap(p => p.items.map(mapListItem)),
    [data],
  );
  const total = data?.pages.at(-1)?.total ?? 0;

  return {
    clients, total, hasMore: hasNextPage ?? false, isLoading: isLoading || isFetchingNextPage,
    rawSearch, setRawSearch,
    category, setCategory,
    loadMore: fetchNextPage,
  };
}

export function useClientCategories() {
  const { data: categories = [{ key: 'all', label: '', count: 0 }] } = useQuery({
    queryKey: queryKeys.clientCategories,
    queryFn: () => clientsApi.getCategories(),
  });
  return categories;
}

export function useClientProfile(clientId: number | null) {
  const { data: profile = null, isLoading } = useQuery({
    queryKey: queryKeys.client(clientId ?? 0),
    queryFn: () => clientsApi.getProfile(clientId!),
    enabled: clientId != null,
  });
  return { profile, isLoading };
}

export function useClientEvents(clientId: number, filter: EventFilterTab, enabled: boolean) {
  const { data: events = [] } = useQuery({
    queryKey: queryKeys.clientEvents(clientId, filter),
    queryFn: () => clientsApi.getEvents(clientId, filter),
    enabled,
  });
  return events;
}

/** Активные и архивные продукты клиента (вкладка «Кошелёк», CL-6.6). */
export function useClientWallet(clientId: number, enabled: boolean) {
  const { data: wallet = null, isLoading } = useQuery({
    queryKey: queryKeys.wallet(clientId),
    queryFn: () => clientsApi.getWallet(clientId),
    enabled,
  });
  return { wallet, isLoading };
}

/** 12 месяцев визитов/оплат клиента (хронологически, от старого к новому). */
export function useClientActivity(clientId: number) {
  const { data: activity = [] } = useQuery({
    queryKey: queryKeys.clientActivity(clientId),
    queryFn: () => clientsApi.getActivity(clientId),
  });
  return activity;
}

/** Полный список заметок (профиль отдаёт только 3 последних). */
export function useClientNotes(clientId: number, enabled: boolean) {
  const { data: notes = [] } = useQuery({
    queryKey: queryKeys.clientNotes(clientId),
    queryFn: () => clientsApi.getNotes(clientId),
    enabled,
  });
  return notes;
}

/** Инвайт-код клиента (V5-7, 2.1) — get-or-create на бэке. Эндпоинт доступен
 * owner+admin; retry отключён, чтобы 403 не крутился повторно. */
export function useClientInviteCode(clientId: number, enabled: boolean) {
  const { data } = useQuery({
    queryKey: queryKeys.clientInviteCode(clientId),
    queryFn: () => clientsApi.getInviteCode(clientId),
    enabled,
    retry: false,
  });
  return data?.invite_code ?? null;
}

/** Включена ли рефералка — гейт видимости блока «Пригласи друга» (V5-7, 2.1).
 * Конфиг доступен только owner; для admin запрос 403, retry отключён — блок
 * просто не показывается (не ошибка, а меньше прав на чтение настроек). */
export function useReferralEnabled(enabled: boolean) {
  const { data } = useQuery({
    queryKey: queryKeys.loyaltyReferralConfig,
    queryFn: () => loyaltyApi.getReferralConfig(),
    enabled,
    retry: false,
  });
  return data?.is_enabled ?? false;
}

/**
 * Все мутации клиента в одном месте: onSuccess инвалидирует ровно те ключи,
 * что видят изменение (см. таблицу в задаче 2.2 роадмапа CL-2).
 */
export function useClientMutations() {
  const qc = useQueryClient();

  const invalidateList = () => qc.invalidateQueries({ queryKey: queryKeys.clientsAll });
  const invalidateDetail = (id: number) => qc.invalidateQueries({ queryKey: queryKeys.client(id) });
  const invalidateCategories = () => qc.invalidateQueries({ queryKey: queryKeys.clientCategories });

  // Базовый набор для любой мутации: список + деталь клиента.
  const invalidateCore = (id: number) => {
    invalidateList();
    invalidateDetail(id);
  };

  const createMut = useMutation({
    mutationFn: (data: ClientCreate) => clientsApi.create(data),
    onSuccess: () => { invalidateList(); invalidateCategories(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => clientsApi.delete(id),
    onSuccess: (_r, id) => { invalidateList(); invalidateCategories(); invalidateDetail(id); },
  });

  // birth_date влияет на категорию «День рождения» — инвалидируем и счётчики.
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ClientUpdate }) => clientsApi.update(id, data),
    onSuccess: (_r, { id }) => { invalidateCore(id); invalidateCategories(); },
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => clientsApi.updateStatus(id, status),
    onSuccess: (_r, { id }) => { invalidateCore(id); invalidateCategories(); },
  });

  const freezeMut = useMutation({
    mutationFn: ({ id, frozen }: { id: number; frozen: boolean }) => clientsApi.freeze(id, frozen),
    onSuccess: (_r, { id }) => {
      invalidateCore(id);
      invalidateCategories();
      qc.invalidateQueries({ queryKey: queryKeys.clientEventsAll(id) });
    },
  });

  const updateRegistrationDateMut = useMutation({
    mutationFn: ({ id, registration_date }: { id: number; registration_date: string }) =>
      clientsApi.updateRegistrationDate(id, registration_date),
    onSuccess: (_r, { id }) => invalidateCore(id),
  });

  const addTagMut = useMutation({
    mutationFn: ({ id, tag }: { id: number; tag: string }) => clientsApi.addTag(id, tag),
    onSuccess: (_r, { id }) => invalidateCore(id),
  });

  const removeTagMut = useMutation({
    mutationFn: ({ id, tag }: { id: number; tag: string }) => clientsApi.removeTag(id, tag),
    onSuccess: (_r, { id }) => invalidateCore(id),
  });

  const createNoteMut = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => clientsApi.createNote(id, text),
    onSuccess: (_r, { id }) => { invalidateDetail(id); qc.invalidateQueries({ queryKey: queryKeys.clientNotes(id) }); },
  });

  const updateNoteMut = useMutation({
    mutationFn: ({ id, noteId, text }: { id: number; noteId: number; text: string }) =>
      clientsApi.updateNote(id, noteId, text),
    onSuccess: (_r, { id }) => { invalidateDetail(id); qc.invalidateQueries({ queryKey: queryKeys.clientNotes(id) }); },
  });

  const deleteNoteMut = useMutation({
    mutationFn: ({ id, noteId }: { id: number; noteId: number }) => clientsApi.deleteNote(id, noteId),
    onSuccess: (_r, { id }) => { invalidateDetail(id); qc.invalidateQueries({ queryKey: queryKeys.clientNotes(id) }); },
  });

  const bookMut = useMutation({
    mutationFn: ({ id, lessonId }: { id: number; lessonId: number }) => clientsApi.book(id, lessonId),
    onSuccess: (_r, { id }) => { invalidateDetail(id); qc.invalidateQueries({ queryKey: queryKeys.clientEventsAll(id) }); },
  });

  const addBonusMut = useMutation({
    mutationFn: ({ id, amount, description }: { id: number; amount: number; description?: string }) =>
      clientsApi.addBonus(id, amount, description),
    onSuccess: (_r, { id }) => { invalidateCore(id); qc.invalidateQueries({ queryKey: queryKeys.clientEventsAll(id) }); },
  });

  return {
    create: (data: ClientCreate) => createMut.mutateAsync(data),
    delete: (id: number) => deleteMut.mutateAsync(id),
    update: (id: number, data: ClientUpdate) => updateMut.mutateAsync({ id, data }),
    updateStatus: (id: number, status: string) => updateStatusMut.mutateAsync({ id, status }),
    freeze: (id: number, frozen: boolean) => freezeMut.mutateAsync({ id, frozen }),
    updateRegistrationDate: (id: number, registration_date: string) =>
      updateRegistrationDateMut.mutateAsync({ id, registration_date }),
    addTag: (id: number, tag: string) => addTagMut.mutateAsync({ id, tag }),
    removeTag: (id: number, tag: string) => removeTagMut.mutateAsync({ id, tag }),
    createNote: (id: number, text: string) => createNoteMut.mutateAsync({ id, text }),
    updateNote: (id: number, noteId: number, text: string) => updateNoteMut.mutateAsync({ id, noteId, text }),
    deleteNote: (id: number, noteId: number) => deleteNoteMut.mutateAsync({ id, noteId }),
    book: (id: number, lessonId: number) => bookMut.mutateAsync({ id, lessonId }),
    addBonus: (id: number, amount: number, description?: string) => addBonusMut.mutateAsync({ id, amount, description }),
  };
}
