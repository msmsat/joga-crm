import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChipsInput } from '../../../../../../components/ui/index';
import { Segmented } from '../../../../../../components/ui/modal';
import { getCurrencySymbol, PhoneField } from '../../../../../../components/UI';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import type { AddClientState } from '../../../hooks/useAddClient';
import { formatMoney, nameInitials } from '../../../utils/mapClient';
import { Field, FieldSlot, InstagramField } from './fields';
import s from '../AddClientModal.module.css';

type Props = { ac: AddClientState };

export function StepPersonal({ ac }: Props) {
  const { t } = useTranslation('clients');
  const { form, errors, set, phoneCheck, emailCheck } = ac;
  const initials = nameInitials(form.name);
  return (
    <>
      <div className={s.nameRow}>
        <div className={initials ? s.avatar : `${s.avatar} ${s.avatarEmpty}`} aria-hidden>
          {initials || (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>
            </svg>
          )}
        </div>
        <Field
          label={t('addModal.step1.name')} required value={form.name} onChange={v => set('name', v)}
          error={errors.name} placeholder={t('addModal.step1.namePlaceholder')}
          inputClassName={s.nameInput} maxLength={100}
          // Имя клиента, а не того, кто заполняет форму: автозаполнение браузера
          // подставило бы сюда имя администратора.
          autoComplete="off" autoCapitalize="words" enterKeyHint="next"
        />
      </div>
      {/* По этому номеру уходят платные шаблоны WhatsApp, поэтому только E.164
          с кодом страны (schemas/_base.OptPhone). PhoneField — тот же компонент,
          что в онбординге и профиле сотрудника. Код страны по умолчанию — по IP. */}
      <FieldSlot
        label={t('addModal.step1.phone')} className={s.phone}
        error={errors.phone ?? (phoneCheck.taken ? t('common:validation.phoneTaken') : undefined)}
        hint={phoneCheck.checking ? t('common:validation.checkingContact') : undefined}
      >
        <PhoneField value={form.phone} onChange={v => set('phone', v ?? '')} defaultCountry={ac.phoneDefaultCountry}/>
      </FieldSlot>
      <Field
        label={t('addModal.step1.email')} value={form.email} onChange={v => set('email', v)}
        error={errors.email ?? (emailCheck.taken ? t('common:validation.emailTaken') : undefined)}
        hint={emailCheck.checking ? t('common:validation.checkingContact') : undefined}
        placeholder={t('addModal.step1.emailPlaceholder')}
        type="email" maxLength={254} inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="next"
      />
      <InstagramField value={form.instagram} onChange={v => set('instagram', v)} error={errors.instagram}/>
    </>
  );
}

export function StepProfile({ ac }: Props) {
  const { t } = useTranslation('clients');
  const { form, set, city, cityIsAuto } = ac;
  return (
    <>
      <Field
        label={t('addModal.step2.city')} value={city} onChange={v => set('city', v)}
        placeholder={t('addModal.step2.cityPlaceholder')}
        hint={cityIsAuto ? t('addModal.step2.cityAuto') : undefined}
        maxLength={100} autoComplete="off" autoCapitalize="words" enterKeyHint="next"
      />
      <Field
        label={t('addModal.step2.bday')} value={form.bday} onChange={v => set('bday', v)}
        type="date" max={new Date().toISOString().slice(0, 10)}
      />
      <FieldSlot label={t('addModal.step2.tags')} hint={t('addModal.step2.tagsHint')}>
        <ChipsInput value={form.tags} onChange={tags => set('tags', tags)} placeholder={t('addModal.step2.tagsPlaceholder')}/>
      </FieldSlot>
      <Field
        label={t('addModal.step2.inviteCode')} value={form.inviteCode} onChange={v => set('inviteCode', v.toUpperCase())}
        hint={t('addModal.step2.inviteCodeHint')}
        autoComplete="off" autoCapitalize="characters" spellCheck={false}
      />
    </>
  );
}

export function StepMembership({ ac }: Props) {
  const { t } = useTranslation('clients');
  const currency = getCurrencySymbol(useStudioCurrency());
  const { form, set, activePackages, selectedPackage } = ac;
  const pick = (id: number | null) => {
    set('membershipId', id);
    if (id === null) set('isMembershipPaid', false);
  };
  return (
    <>
      <FieldSlot label={t('addModal.step3.classCount')}>
        {activePackages.length === 0 ? (
          <div className={s.noPackages}>
            <div>{t('addModal.step3.noPackages')}</div>
            <Link to="/dashboard/catalog">{t('addModal.step3.noPackagesLink')}</Link>
          </div>
        ) : (
          <div className={s.packages}>
            <button type="button" aria-pressed={form.membershipId === null} onClick={() => pick(null)} className={form.membershipId === null ? `${s.pkg} ${s.pkgOn}` : s.pkg}>
              <div className={s.pkgName}>{t('addModal.step3.noPackage')}</div>
            </button>
            {activePackages.map(pkg => (
              <button type="button" key={pkg.id} aria-pressed={form.membershipId === pkg.id} onClick={() => pick(pkg.id)} className={form.membershipId === pkg.id ? `${s.pkg} ${s.pkgOn}` : s.pkg}>
                <div className={s.pkgName}>{pkg.name}</div>
                <div className={s.pkgMeta}>{t('addModal.step3.classesCount', { count: pkg.class_count })} · {formatMoney(pkg.price, currency)}</div>
              </button>
            ))}
          </div>
        )}
        {selectedPackage && (
          <div className={s.paidBox}>
            <Segmented
              label={t('addModal.step3.alreadyPaid')}
              value={form.isMembershipPaid ? 'yes' : 'no'}
              options={[{ value: 'yes', label: t('addModal.step3.yes') }, { value: 'no', label: t('addModal.step3.no') }]}
              onChange={v => set('isMembershipPaid', v === 'yes')}
            />
          </div>
        )}
      </FieldSlot>
      <Field
        label={t('addModal.step3.note')} value={form.note} onChange={v => set('note', v)}
        placeholder={t('addModal.step3.notePlaceholder')} rows={3}
      />
    </>
  );
}

export function StepSummary({ ac }: Props) {
  const { t, i18n } = useTranslation('clients');
  const { form, city, selectedPackage } = ac;
  const cells = [
    { l: t('addModal.step4.fields.phone'), v: form.phone || '—' },
    { l: t('addModal.step4.fields.email'), v: form.email || '—' },
    // Только если заполнен: пустая плитка «Instagram —» ничего не говорит, а место занимает.
    ...(form.instagram ? [{ l: t('addModal.step1.instagram'), v: `@${form.instagram}` }] : []),
    { l: t('addModal.step4.fields.bday'), v: form.bday ? new Date(form.bday).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
    { l: t('addModal.step4.fields.city'), v: city || '—' },
    { l: t('addModal.step4.fields.subscription'), v: selectedPackage ? selectedPackage.name : t('addModal.step3.noPackage') },
    { l: t('addModal.step4.fields.tags'), v: form.tags.length ? form.tags.join(', ') : '—' },
  ];
  return (
    <>
      <div className={s.done}>
        <div className={s.doneIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div className={s.doneTitle}>{t('addModal.step4.readyTitle')}</div>
        <div className={s.doneSub}>{t('addModal.step4.readySub')}</div>
      </div>
      <div className={s.summary}>
        <div className={s.summaryHead}>
          <div className={s.avatar}>{nameInitials(form.name) || '?'}</div>
          <div>
            <div className={s.summaryName}>{form.name || '—'}</div>
            <div className={s.summarySub}>{t('addModal.step4.newClient')}</div>
          </div>
        </div>
        <div className={s.summaryGrid}>
          {cells.map(({ l, v }) => (
            <div key={l} className={s.summaryCell}>
              <div className={s.summaryLabel}>{l}</div>
              <div className={s.summaryValue}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
