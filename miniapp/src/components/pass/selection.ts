import { useSyncExternalStore } from 'react';

/**
 * Какая карта витрины выбрана — вне состояния листа.
 *
 * Лист кита (Sheet) тянется пальцем, и framer пересчитывает его геометрию на
 * каждом перерендере: замер раскладки всего листа, ~180 мс при CPU ×4. Живи
 * выбор в BuyModal, каждая пролистанная карта перерисовывала бы лист целиком.
 * Здесь на выбор подписаны только те, кто его показывает: цена под картами и
 * кнопка оплаты.
 */
export type Selection = {
  get: () => SelectionState;
  set: (index: number) => void;
  subscribe: (listener: () => void) => () => void;
};

export type SelectionState = { index: number; dir: number };

export function createSelection(initial: number): Selection {
  let state: SelectionState = { index: initial, dir: 1 };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (index) => {
      if (index === state.index) return;
      state = { index, dir: index > state.index ? 1 : -1 };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useSelection(selection: Selection): SelectionState {
  return useSyncExternalStore(selection.subscribe, selection.get);
}
