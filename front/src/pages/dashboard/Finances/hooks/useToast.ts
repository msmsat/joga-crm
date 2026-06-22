import { useState, useRef } from 'react';
import type { ToastType } from '../types';

export function useToast() {
  const [state, setState] = useState({ msg: '', type: 'success' as ToastType, visible: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = (msg: string, type: ToastType = 'success') => {
    clearTimeout(timerRef.current);
    setState({ msg, type, visible: true });
    timerRef.current = setTimeout(() => setState(s => ({ ...s, visible: false })), 2500);
  };

  return { toast: state, show };
}
