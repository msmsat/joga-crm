import { useEffect, useState } from 'react';
import type { Trainer } from '../types';

const PHONE = '(max-width: 767px)';
/** Ширина колонки времени слева (Grid.tsx, gridTemplateColumns). */
const TIME_COL = 56;
/** Уже этой колонки имя и карточка занятия перестают читаться. */
const MIN_COL = 64;
const MIN_PER_PAGE = 3;
const MAX_PER_PAGE = 5;
/** Кого показывать на телефоне — удобство одного устройства, не общая настройка. */
const STORAGE_KEY = 'journal:mobileTrainers';

function readSelected(): number[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const ids = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) && ids.every(n => typeof n === 'number') ? ids : null;
  } catch {
    return null;
  }
}

function measure() {
  const isPhone = window.matchMedia(PHONE).matches;
  const perPage = Math.min(MAX_PER_PAGE, Math.max(MIN_PER_PAGE, Math.floor((window.innerWidth - TIME_COL) / MIN_COL)));
  return { isPhone, perPage };
}

/**
 * Тренеры на телефоне: колонки всегда во всю ширину экрана, листания вбок нет.
 * Сколько колонок влезает, считается по ширине (3–5). Кого показывать, выбирает
 * человек (выбор помнится на устройстве); если выбранных больше, чем влезает,
 * они листаются страницами. Последняя страница — это последние perPage
 * тренеров, а не остаток: иначе колонки прыгали бы по ширине между страницами.
 * На десктопе хук отдаёт тренеров как есть.
 */
export function useTrainerPages(trainers: Trainer[]) {
  const [{ isPhone, perPage }, setSize] = useState(measure);
  const [selectedIds, setSelectedState] = useState<number[] | null>(readSelected);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const onResize = () => setSize(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setSelectedIds = (ids: number[] | null) => {
    setSelectedState(ids);
    setPage(0);
    try {
      if (ids) localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* приватный режим: выбор проживёт до перезагрузки */ }
  };

  // Выбор хранит id, а список тренеров меняется по дням. Выбранный, которого
  // в этом дне нет, не в счёт; если не осталось никого — показываем всех.
  const chosen = selectedIds ? trainers.filter(t => selectedIds.includes(t.id)) : trainers;
  const shown = isPhone && chosen.length > 0 ? chosen : trainers;

  const pageCount = isPhone ? Math.max(1, Math.ceil(shown.length / perPage)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const start = Math.max(0, Math.min(safePage * perPage, shown.length - perPage));
  const pageTrainers = isPhone ? shown.slice(start, start + perPage) : trainers;

  return {
    isPhone,
    pageTrainers,
    page: safePage,
    pageCount,
    setPage,
    selectedIds,
    setSelectedIds,
  };
}
