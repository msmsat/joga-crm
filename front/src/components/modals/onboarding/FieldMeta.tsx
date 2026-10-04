import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

// Пометка поля мастера: «Обязательно» или «Необязательно» рядом с подписью и
// строка «зачем это» под полем. Раньше мастер молчал, что нужно, а что нет:
// «Продолжить» просто серела, и человек гадал, чего от него хотят.
// Обязательная пометка, как только поле заполнено, перекрашивается в
// фисташковый и получает галочку — видно, что именно держит кнопку.
// Вид — классы .ob-tag / .ob-hint в App.css.

const CHECK = (
  <svg width="8" height="8" viewBox="0 0 10 8" fill="none">
    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

interface TagProps {
  required?: boolean;
  /** Обязательное поле уже заполнено так, что шаг можно пройти. */
  done?: boolean;
}

export function FieldTag({ required = false, done = false }: TagProps) {
  const { t } = useTranslation("onboarding");
  const state = !required ? "is-optional" : done ? "is-required is-done" : "is-required";
  return (
    <span className={`ob-tag ${state}`}>
      {required && (
        <span className="ob-tag-mark" aria-hidden="true">
          {done ? CHECK : <span className="ob-tag-dot" />}
        </span>
      )}
      {t(required ? "onboarding:fields.required" : "onboarding:fields.optional")}
    </span>
  );
}

/** Подпись поля с пометкой — для label у InputField/PhoneField и своих подписей. */
export function FieldLabel({ children, required, done }: TagProps & { children: ReactNode }) {
  return (
    <span className="ob-field-label">
      {children}
      <FieldTag required={required} done={done} />
    </span>
  );
}

/** «Зачем это» — ставится сразу после поля, в общей с ним обёртке. */
export function FieldHint({ children }: { children: ReactNode }) {
  return <span className="ob-hint">{children}</span>;
}
