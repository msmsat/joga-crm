// «+ Новый клиент» внутри мастера записи: лист не закрывается и не
// перекрывается вторым окном — его содержимое меняется на форму клиента,
// ту же, что на странице Клиентов (одной прокручиваемой формой, как на
// телефоне). Добавленный клиент возвращается в список первым и выбранным.
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAddClient } from '../../../../Clients/hooks/useAddClient';
import { AddClientFields } from '../../../../Clients/components/modals/addClient/AddClientFields';

export function NewClientStep({ onCreated }: {
  onCreated: (id: number, name: string, hint?: string) => void;
}) {
  const { t } = useTranslation('clients');
  const bodyRef = useRef<HTMLDivElement>(null);
  const ac = useAddClient(true, (form, id) =>
    onCreated(id, form.name.trim(), form.phone || form.email.trim() || undefined));

  // Ошибка может оказаться ниже края листа — показываем её, а не молчим.
  const submit = () => {
    if (ac.submit()) return;
    requestAnimationFrame(() => bodyRef.current
      ?.querySelector('[aria-invalid="true"]')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  return (
    <>
      <div className="bw-body bw-new-client">
        <AddClientFields ac={ac} bodyRef={bodyRef} inert={ac.saving} />
      </div>
      <div className="kp-foot">
        <button type="button" className="btn-primary-sm" disabled={!ac.canSubmit}
                style={{ opacity: ac.canSubmit ? 1 : 0.5 }} onClick={submit}>
          {t('addModal.submit')}
        </button>
      </div>
    </>
  );
}
