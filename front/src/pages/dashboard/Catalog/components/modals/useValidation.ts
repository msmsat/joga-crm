import { useState } from "react";

// Мелкая валидация форм Каталога: правила вычисляются в модалке (errors: {поле: текст|null}),
// хук лишь решает, когда ошибку показывать — после blur поля ИЛИ попытки сабмита.
export function useValidation<E extends Record<string, string | null>>(errors: E) {
  const [touched, setTouched] = useState<Partial<Record<keyof E, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const touch = (field: keyof E) => () => setTouched(t => ({ ...t, [field]: true }));
  // Показать текст ошибки поля, только если оно тронуто или была попытка сабмита.
  const show = (field: keyof E): string | undefined =>
    (submitted || touched[field]) && errors[field] ? errors[field]! : undefined;

  const hasErrors = Object.values(errors).some(Boolean);

  // Вызывать в onClick сабмита: помечает попытку и возвращает, можно ли отправлять.
  const trySubmit = () => {
    setSubmitted(true);
    return !hasErrors;
  };

  return { touch, show, hasErrors, trySubmit };
}
