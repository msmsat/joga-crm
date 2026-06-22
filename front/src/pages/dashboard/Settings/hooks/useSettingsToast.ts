import { useState } from "react";

export function useSettingsToast() {
  const [toast, setToast] = useState<string | null>(null);
  const [savedStates, setSavedStates] = useState<Record<string, boolean>>({});

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const triggerSave = (key: string, msg: string) => {
    setSavedStates(p => ({ ...p, [key]: true }));
    triggerToast(msg);
    setTimeout(() => setSavedStates(p => ({ ...p, [key]: false })), 2000);
  };

  return { toast, triggerToast, savedStates, triggerSave };
}
