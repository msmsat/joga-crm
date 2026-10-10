import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Button, ConfirmModal, SidePanelBody, SidePanelFoot, SidePanelHead, useToast,
} from '../../../../../../components/ui/index';
import { loyaltyApi } from '../../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../../api/queryKeys';
import { errorMessage } from '../../../../../../api/errorMessage';
import type { DiscountCampaign, DiscountConfig } from '../../../../../../api/loyalty/loyalty.types';
import s from './Discounts.module.css';
import DiscountList from './DiscountList';
import DiscountEditor from './DiscountEditor';
import { REQUIRED, checksOf, draftOf, emptyDraft, isValid, toPayload, type DiscountDraft } from './discountModel';
import { IconBack, IconPlus, IconTrash } from './DiscountIcons';

interface Props {
  title: string;
  icon: ReactNode;
  config: DiscountConfig | null;
  onClose: () => void;
}

// Панель «Скидки»: список скидок со шкалой и редактор одной скидки — два
// экрана одной панели. Редактор въезжает справа поверх списка и уезжает
// обратно; шапка и подвал меняются вместе с ним. Каждая скидка сохраняется
// сразу (свой CRUD), общий конвейер Save/Cancel программы здесь не участвует.

type View = { kind: 'list' } | { kind: 'edit'; id: number | null };

export default function DiscountsPanel({ title, icon, config, onClose }: Props) {
  const { t } = useTranslation(['loyalty', 'common']);
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const bodyRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View>({ kind: 'list' });
  const [draft, setDraft] = useState<DiscountDraft>(emptyDraft);
  const [pristine, setPristine] = useState(true);
  const [attempted, setAttempted] = useState(false);
  // Что удаляем — своим состоянием, а не «текущая скидка редактора»: после
  // удаления редактор уходит в список, а окно подтверждения ещё доигрывает уход.
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data: campaigns = [], isPending } = useQuery({
    queryKey: queryKeys.loyaltyDiscountCampaigns,
    queryFn: () => loyaltyApi.getDiscountCampaigns(),
  });

  // Сохранённая скидка вспыхивает в списке — видно, куда она встала.
  useEffect(() => {
    if (highlightId == null) return;
    const id = window.setTimeout(() => setHighlightId(null), 1800);
    return () => window.clearTimeout(id);
  }, [highlightId]);

  const scrollTop = () => bodyRef.current?.scrollTo({ top: 0 });
  // Новая скидка может включить программу, а счётчик карточки «Скидки»
  // считает действующие скидки — перечитываем и то, и другое.
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.loyaltyDiscountCampaigns }),
    qc.invalidateQueries({ queryKey: queryKeys.loyaltyConfigs }),
    qc.invalidateQueries({ queryKey: queryKeys.loyaltyStats }),
  ]);

  const openEditor = (campaign?: DiscountCampaign, preset?: DiscountDraft) => {
    setDraft(campaign ? draftOf(campaign) : preset ?? emptyDraft());
    setPristine(!campaign && !preset);
    setAttempted(false);
    setView({ kind: 'edit', id: campaign?.id ?? null });
    scrollTop();
  };
  const backToList = () => { setView({ kind: 'list' }); scrollTop(); };

  const patchDraft = (patch: Partial<DiscountDraft>) => {
    setDraft(d => ({ ...d, ...patch }));
    setPristine(false);
  };

  const editingId = view.kind === 'edit' ? view.id : null;
  const checks = checksOf(draft);
  const filled = REQUIRED.filter(key => checks[key]).length;

  const save = useMutation({
    mutationFn: () => editingId == null
      ? loyaltyApi.createDiscountCampaign(toPayload(draft))
      : loyaltyApi.updateDiscountCampaign(editingId, toPayload(draft)),
    onSuccess: saved => {
      void refresh();
      toast.success(editingId == null ? t('loyalty:discounts.toasts.created') : t('loyalty:discounts.toasts.saved'));
      setHighlightId(saved.id);
      backToList();
    },
    onError: err => toast.error(errorMessage(err, t)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => loyaltyApi.deleteDiscountCampaign(id),
    onSuccess: () => {
      void refresh();
      toast.success(t('loyalty:discounts.toasts.deleted'));
      backToList();
    },
    onError: err => toast.error(errorMessage(err, t)),
  });

  // Пауза с карточки — сразу в кэше, без ожидания сервера; ошибка откатывает.
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      loyaltyApi.updateDiscountCampaign(id, { is_active: active }),
    onMutate: ({ id, active }) => {
      setBusyId(id);
      const before = qc.getQueryData<DiscountCampaign[]>(queryKeys.loyaltyDiscountCampaigns);
      qc.setQueryData<DiscountCampaign[]>(queryKeys.loyaltyDiscountCampaigns, list =>
        list?.map(c => (c.id === id ? { ...c, is_active: active } : c)));
      return { before };
    },
    onError: (err, _vars, context) => {
      if (context?.before) qc.setQueryData(queryKeys.loyaltyDiscountCampaigns, context.before);
      toast.error(errorMessage(err, t));
    },
    onSettled: () => { setBusyId(null); void refresh(); },
  });

  const enable = useMutation({
    mutationFn: () => loyaltyApi.updateDiscountConfig({ is_enabled: true }),
    onSuccess: () => { void refresh(); toast.success(t('loyalty:discounts.toasts.programOn')); },
    onError: err => toast.error(errorMessage(err, t)),
  });

  const submit = () => {
    setAttempted(true);
    if (!isValid(checks)) {
      toast.error(t('loyalty:discounts.errors.fillRequired'));
      // К первому, что держит сохранение: обязательная пометка ещё не
      // фисташковая, либо поле с ошибкой.
      requestAnimationFrame(() => {
        const target = bodyRef.current?.querySelector('.v-field-tag.is-required:not(.is-done), [role="alert"]');
        target?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    save.mutate();
  };

  const active = campaigns.filter(c => c.status === 'active').length;
  const scheduled = campaigns.filter(c => c.status === 'scheduled').length;
  const listSubtitle = campaigns.length === 0
    ? t('loyalty:discounts.list.subtitleEmpty')
    : t('loyalty:discounts.list.subtitle', { active, scheduled });
  const editing = view.kind === 'edit';
  const editingName = editing && editingId != null ? campaigns.find(c => c.id === editingId)?.name : null;

  // Редактор приезжает справа, список возвращается слева — направление
  // движения совпадает с «вперёд» и «назад».
  const slide = (dir: 1 | -1) => reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
      initial: { opacity: 0, x: 36 * dir },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -24 * dir },
    };

  return (
    <>
      <SidePanelHead
        icon={editing ? undefined : icon}
        leading={editing ? (
          <button type="button" className={s.back} onClick={backToList} aria-label={t('loyalty:discounts.editor.back')}>
            <IconBack />
          </button>
        ) : undefined}
        title={editing ? (editingName ?? t('loyalty:discounts.editor.newTitle')) : title}
        subtitle={editing
          ? t('loyalty:discounts.editor.progress', { filled, total: REQUIRED.length })
          : listSubtitle}
        aside={editing ? <ProgressRing value={filled / REQUIRED.length} /> : undefined}
        onClose={onClose}
      />
      <SidePanelBody bodyRef={bodyRef}>
        <AnimatePresence mode="wait" initial={false}>
          {editing ? (
            <motion.div key={`edit-${editingId ?? 'new'}`} {...slide(1)}
                        transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}>
              <DiscountEditor
                draft={draft}
                onChange={patchDraft}
                checks={checks}
                attempted={attempted}
                pristine={pristine && editingId == null}
                onTemplate={next => { setDraft(next); setPristine(false); }}
              />
            </motion.div>
          ) : (
            <motion.div key="list" {...slide(-1)} transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}>
              <DiscountList
                campaigns={campaigns}
                loading={isPending}
                config={config}
                highlightId={highlightId}
                busyId={busyId}
                onOpen={c => openEditor(c)}
                onCreate={preset => openEditor(undefined, preset)}
                onToggle={(c, value) => toggle.mutate({ id: c.id, active: value })}
                onEnableProgram={() => enable.mutate()}
                enabling={enable.isPending}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </SidePanelBody>
      <SidePanelFoot>
        {editing ? (
          <>
            {editingId != null && (
              <Button variant="ghost" icon={<IconTrash />} ariaLabel={t('loyalty:discounts.editor.delete')}
                      onClick={() => setDeleting({ id: editingId, name: draft.name })} style={{ flex: '0 0 auto' }}>
                <span className={s.footLabel}>{t('loyalty:discounts.editor.delete')}</span>
              </Button>
            )}
            <span className={s.footSpacer} />
            <Button variant="ghost" onClick={backToList}>{t('loyalty:drawer.cancel')}</Button>
            <Button loading={save.isPending} onClick={submit}>
              {editingId == null ? t('loyalty:discounts.editor.create') : t('loyalty:discounts.editor.save')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>{t('loyalty:drawer.close')}</Button>
            <Button icon={<IconPlus />} onClick={() => openEditor()} style={{ flex: 1 }}>
              {t('loyalty:discounts.list.create')}
            </Button>
          </>
        )}
      </SidePanelFoot>

      {deleting && (
        <ConfirmModal
          danger
          title={t('loyalty:discounts.confirmDelete.title')}
          message={t('loyalty:discounts.confirmDelete.message', { name: deleting.name })}
          confirmText={t('loyalty:discounts.editor.delete')}
          cancelText={t('loyalty:drawer.cancel')}
          onConfirm={() => remove.mutateAsync(deleting.id).then(() => undefined)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/** Сколько обязательного заполнено — кольцом в шапке редактора. */
function ProgressRing({ value }: { value: number }) {
  const r = 15;
  const length = 2 * Math.PI * r;
  return (
    <svg className={s.ring} width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
      <circle cx="19" cy="19" r={r} className={s.ringTrack} />
      <motion.circle
        cx="19" cy="19" r={r}
        className={`${s.ringValue}${value >= 1 ? ` ${s.ringDone}` : ''}`}
        strokeDasharray={length}
        initial={false}
        animate={{ strokeDashoffset: length * (1 - value) }}
        transition={{ type: 'spring', stiffness: 160, damping: 24 }}
      />
    </svg>
  );
}
