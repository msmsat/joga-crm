// Стек undo/redo Журнала: массив + указатель, никакой библиотеки. Каждая
// запись — уже закоммиченная на сервер операция и пара обратных вызовов;
// сам стек живёт только в памяти компонента (решение владельца — уход со
// страницы стек не обязан переживать, всё уже сохранено на сервере).
import { useCallback, useRef, useState } from 'react';

export interface HistoryEntry {
  label: string;                // «перенос занятия» — для title кнопок и success-тоста
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const MAX_DEPTH = 50;

export function useUndoHistory() {
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  // Блокировка параллельных undo/redo (двойной Ctrl+Z до завершения первого
  // сдвинул бы указатель дважды за одну исполняющуюся операцию).
  const busy = useRef(false);

  const push = useCallback((entry: HistoryEntry) => {
    setPast(prev => {
      const next = [...prev, entry];
      return next.length > MAX_DEPTH ? next.slice(next.length - MAX_DEPTH) : next;
    });
    setFuture([]); // новая операция — «вперёд» больше некуда
  }, []);

  // Заменить последнюю entry (redo создания занятия получает новый id — стек
  // должен откатывать уже его, а не исходный).
  const replaceLast = useCallback((entry: HistoryEntry) => {
    setPast(prev => (prev.length === 0 ? prev : [...prev.slice(0, -1), entry]));
  }, []);

  const undo = useCallback(async (onError: (label: string, e: unknown) => void) => {
    if (busy.current || past.length === 0) return;
    const entry = past[past.length - 1];
    busy.current = true;
    try {
      await entry.undo();
      setPast(prev => prev.slice(0, -1));
      setFuture(prev => [...prev, entry]);
      return entry.label;
    } catch (e) {
      // Битый откат (409 и т.п.) выкидываем из стека — не зацикливаем пользователя.
      setPast(prev => prev.slice(0, -1));
      onError(entry.label, e);
    } finally {
      busy.current = false;
    }
  }, [past]);

  const redo = useCallback(async (onError: (label: string, e: unknown) => void) => {
    if (busy.current || future.length === 0) return;
    const entry = future[future.length - 1];
    busy.current = true;
    try {
      await entry.redo();
      setFuture(prev => prev.slice(0, -1));
      setPast(prev => [...prev, entry]);
      return entry.label;
    } catch (e) {
      setFuture(prev => prev.slice(0, -1));
      onError(entry.label, e);
    } finally {
      busy.current = false;
    }
  }, [future]);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past[past.length - 1]?.label,
    redoLabel: future[future.length - 1]?.label,
    push,
    replaceLast,
    undo,
    redo,
  };
}
