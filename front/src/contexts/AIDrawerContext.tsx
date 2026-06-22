import { createContext, useContext, useState, type ReactNode } from 'react';

interface AIDrawerContextValue {
  isOpen: boolean;
  showHistory: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  enterHistory: () => void;
  exitHistory: () => void;
}

const AIDrawerContext = createContext<AIDrawerContextValue | null>(null);

export function AIDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const open = () => setIsOpen(true);
  const close = () => { setIsOpen(false); setShowHistory(false); };
  const toggle = () => { if (isOpen) close(); else open(); };
  const enterHistory = () => setShowHistory(true);
  const exitHistory = () => setShowHistory(false);

  return (
    <AIDrawerContext.Provider value={{ isOpen, showHistory, open, close, toggle, enterHistory, exitHistory }}>
      {children}
    </AIDrawerContext.Provider>
  );
}

export function useAIDrawer() {
  const ctx = useContext(AIDrawerContext);
  if (!ctx) throw new Error('useAIDrawer must be used inside AIDrawerProvider');
  return ctx;
}
