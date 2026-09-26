import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { AddClientState } from '../../../hooks/useAddClient';
import { StepMembership, StepPersonal, StepProfile } from './sections';
import s from '../AddClientModal.module.css';

/** «Новый клиент» одной прокручиваемой формой — все шаги большого мастера
    подряд. Так форма выглядит на телефоне и внутри мастера записи журнала,
    где клиента заводят, не уходя из записи. */
export function AddClientFields({ ac, bodyRef, inert }: {
  ac: AddClientState; bodyRef?: Ref<HTMLDivElement>; inert?: boolean;
}) {
  const { t } = useTranslation('clients');
  return (
    <div ref={bodyRef} inert={inert} className={`${s.body} ms-scroll`}>
      <section className={s.section}>
        <StepPersonal ac={ac}/>
      </section>
      <section className={s.section}>
        <h3 className={s.sectionTitle}>{t('addModal.steps.2.title')}</h3>
        <StepProfile ac={ac}/>
      </section>
      <section className={s.section}>
        <h3 className={s.sectionTitle}>{t('addModal.steps.3.title')}</h3>
        <StepMembership ac={ac}/>
      </section>
    </div>
  );
}
