import type { KeyboardEvent } from 'react';

// Enter в поле = нажатие главной кнопки формы. Вешается на КОНТЕЙНЕР (карточку
// модалки, блок полей) — тогда правило одно на всю форму и не зависит от того,
// из чего собрано конкретное поле.
//
// Почему обработчик, а не нативный <form>: в проекте ~470 кнопок и лишь у 50 из
// них проставлен type. Внутри <form> все остальные стали бы submit, и Enter
// нажимал бы не CTA, а первую попавшуюся кнопку разметки (в форме входа это
// «Показать» у пароля). Обернуть форму дешевле, чем выверить 400 кнопок.
//
// Не срабатывает, если:
//  • событие уже обработано (ChipsInput, Select — они делают preventDefault);
//  • курсор в textarea или contenteditable — там Enter это перевод строки;
//  • фокус на кнопке/ссылке/нативном select — у них своя реакция на Enter;
//  • нажат модификатор или идёт набор через IME (промежуточный Enter композиции).
export function submitOnEnter(run?: ((e: KeyboardEvent) => void) | null) {
  return (e: KeyboardEvent) => {
    if (!run || e.key !== 'Enter' || e.defaultPrevented) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;

    const el = e.target as HTMLElement | null;
    if (!el) return;
    if (el.isContentEditable) return;
    if (['TEXTAREA', 'BUTTON', 'A', 'SELECT'].includes(el.tagName)) return;

    e.preventDefault();
    run(e);
  };
}
