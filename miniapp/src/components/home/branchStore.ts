import { startTransition, useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Филиал, выбранный на главной, — вне состояния самой главной.
 *
 * Живи он в `Home`, каждое касание капсулы перерисовывало бы главную целиком
 * вместе с заранее собранными листами (витрина абонементов, оба мастера
 * записи): замерено 240–300 мс одной задачей при CPU ×4 — ровно в кадре, где
 * у капсулы меняется значок, и цвет его заикался. Здесь на выбор подписаны
 * только те, кто его показывает: капсула, строка адреса под названием и
 * мастер группы (он берёт дни заранее под выбранный адрес). Главная читает
 * выбор в момент нажатия на вход в запись — рисовать по нему ей нечего.
 *
 * Тот же приём, что у выбора карты в витрине (`pass/selection.ts`).
 */
export type BranchStore = {
  /** Выбранный филиал; `null` — «Все филиалы». */
  get: () => number | null;
  set: (id: number | null) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createBranchStore(): BranchStore {
  let value: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (id) => {
      if (id === value) return;
      value = id;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Выбор, которого в каталоге уже нет, — снова «все», а не пустая запись:
 *  каталог мог перечитаться без этого адреса. */
export function knownBranch(id: number | null, branches: { id: number }[] | undefined): number | null {
  return id !== null && branches?.some((row) => row.id === id) ? id : null;
}

/** Выбранный филиал для того, кто его показывает. */
export function useBranch(store: BranchStore, branches: { id: number }[] | undefined): number | null {
  return knownBranch(useSyncExternalStore(store.subscribe, store.get), branches);
}

/**
 * Выбранный филиал для того, кто по нему только готовит данные заранее
 * (мастер группы), — переходом, а не в кадре касания. Перерисовка собранного
 * листа уступает кадры капсуле и меню: React дробит её и прерывает, если
 * человек уже нажимает дальше.
 */
export function useBranchLater(store: BranchStore, branches: { id: number }[] | undefined): number | null {
  const [value, setValue] = useState(store.get);
  useEffect(() => {
    const sync = () => startTransition(() => setValue(store.get()));
    sync();
    return store.subscribe(sync);
  }, [store]);
  return knownBranch(value, branches);
}
