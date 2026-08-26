import React, { useState, useMemo, useEffect } from 'react';
import { useAiEntity } from '../../../hooks/useAiEntity';
import { useTranslation } from 'react-i18next';
import './Staff.css';
import type { Employee, ScheduleMatrix, SchedulesMap, RoleCard } from './types';
import { TIME_OPTIONS, DAYS_KEYS, ROLE_CARDS, DEFAULT_WEEK_HOURS } from './constants';
import { useAiIntent } from '../../../hooks/useAiIntent';
import { useStaffList } from './hooks/useStaffList';
import { useStaffProfile } from './hooks/useStaffProfile';
import { useStaffFilters } from './hooks/useStaffFilters';
import { StaffList }  from './components/StaffList';
import { StaffStats } from './components/StaffStats';
import { AddEmployeeModal }  from './components/modals/AddEmployeeModal';
import EditStaffModal from '../../../components/modals/EditStaffModal';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { OwnerContactsModal } from './components/modals/OwnerContactsModal';
import { useToast } from '../../../components/ui/Toast';
import { ApiError, resolveImageUrl } from '../../../api/client';
import { staffApi } from '../../../api/staff';
import { settingsApi } from '../../../api/settings/settings.api';
import { getCurrencySymbol } from '../../../components/UI';
import type { StaffListItem, StaffWorkingHoursItem, StaffProfile, StaffMonthScheduleResponse } from '../../../api/staff/staff.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FALLBACK_GRADIENT = 'linear-gradient(135deg,#FCAE91,#f5887a)';

function toEmployee(item: StaffListItem): Employee {
  return {
    id: item.id,
    name: item.name,
    last_name: item.last_name ?? undefined,
    email: item.email,
    phone: item.phone ?? undefined,
    role: item.role,
    department: item.department,
    is_online: item.is_online,
    is_active: item.is_active,
    photo_url: item.photo_url ?? undefined,
    avatar_gradient: item.avatar_gradient ?? undefined,
    stats: { total_bookings: 0, total_attended: 0, load_percent: 0, total_revenue: 0 },
  };
}

function scheduleToWorkingHours(
  schedule: Record<string, { enabled: boolean; from: string; to: string }> | undefined
): StaffWorkingHoursItem[] {
  if (!schedule) return [];
  return DAYS_KEYS.map((key, dayOfWeek) => ({
    day_of_week: dayOfWeek,
    is_open: schedule[key]?.enabled ?? false,
    open_time: schedule[key]?.from ?? '09:00',
    close_time: schedule[key]?.to ?? '18:00',
  }));
}

function workingHoursToSchedule(
  hours: StaffWorkingHoursItem[]
): Record<string, { enabled: boolean; from: string; to: string }> {
  const byDay = new Map(hours.map(wh => [wh.day_of_week, wh]));
  const schedule: Record<string, { enabled: boolean; from: string; to: string }> = {};
  DAYS_KEYS.forEach((key, dayOfWeek) => {
    const wh = byDay.get(dayOfWeek);
    schedule[key] = {
      enabled: wh?.is_open ?? false,
      from: wh?.open_time ?? '09:00',
      to: wh?.close_time ?? '18:00',
    };
  });
  return schedule;
}

// Личного графика в базе может не быть (сотрудника завели без него) — тогда и
// недельная сетка, и календарь месяца показывают график по умолчанию, а не пустоту.
function weekHoursOf(profile: StaffProfile): StaffWorkingHoursItem[] {
  return profile.week_working_hours.length ? profile.week_working_hours : DEFAULT_WEEK_HOURS;
}

function hoursToMatrix(hours: StaffWorkingHoursItem[]): ScheduleMatrix {
  const matrix: ScheduleMatrix = Array.from({ length: TIME_OPTIONS.length }, () => Array(7).fill(0));
  for (const wh of hours) {
    if (!wh.is_open) continue;
    for (let ti = 0; ti < TIME_OPTIONS.length; ti++) {
      if (TIME_OPTIONS[ti] >= wh.open_time && TIME_OPTIONS[ti] < wh.close_time) {
        matrix[ti][wh.day_of_week] = 1;
      }
    }
  }
  return matrix;
}

// ─── Local state types ────────────────────────────────────────────────────────

interface DeleteModal {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  showDontAsk?: boolean;
  onConfirm: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Staff() {
  const { t, i18n } = useTranslation(['staff', 'common']);

  // ── API hooks ─────────────────────────────────────────────────────────────
  const { rawStaff, isLoading: listLoading, refetch: refetchStaff, create, update, deleteStaff } = useStaffList();
  const [pickedStaffId, setPickedStaffId] = useState<number | null>(() => {
    const saved = localStorage.getItem('staff_active_id');
    return saved ? Number(saved) : null;
  });

  // Автовыбор только среди принявших приглашение: иначе правая панель встала бы
  // на человеке, профиля у которого ещё нет. Считаем при рендере, а не эффектом —
  // панель не мигает пустотой на первом кадре.
  const selectableStaff = rawStaff.filter(s => s.is_active);
  const activeStaffId =
    selectableStaff.length === 0 ? pickedStaffId
    : pickedStaffId && selectableStaff.some(s => s.id === pickedStaffId) ? pickedStaffId
    : (selectableStaff.find(s => s.role === 'owner') ?? selectableStaff[0]).id;

  const { profile, monthData, isLoading: profileLoading, refetchProfile, fetchMonth, cancelLesson } = useStaffProfile(activeStaffId);
  // Ассистенту: чей профиль открыт — та же фраза «покажи её расписание»
  // здесь обязана означать тренера, а не клиента.
  useAiEntity('staff', activeStaffId);

  // Создаем "Подготовленные данные для интерфейса" (ViewModel)
  const adaptedStaff = useMemo(() => rawStaff.map(item => {
    const emp = toEmployee(item);
    
    // Определяем сырой ключ отдела (если его нет, берем роль)
    const rawGroup = emp.role;

    return {
      ...emp,
      // 🔥 Вот твоя идея в действии! Переводим заранее:
      _translatedRole: t(`staff:roles.${emp.role}`, { defaultValue: emp.role }),
      _resolvedGroupKey: rawGroup, // Оставляем сырой ключ для логики React (key)
      _translatedGroup: t(`staff:roles.${rawGroup}`, { defaultValue: rawGroup })
    };
  }), [rawStaff, t]); // t в зависимостях: при смене языка массив пересоберется сам!

  const ownerCount = rawStaff.filter(s => s.role === 'owner').length;

  const selectStaff = (id: number | null) => {
    // Пока приглашение не принято, показывать в профиле нечего — карточка в
    // списке и так не кликается, но выбор мог прийти и из localStorage.
    if (id != null && rawStaff.find(s => s.id === id)?.is_active === false) return;
    if (id != null) localStorage.setItem('staff_active_id', String(id));
    else localStorage.removeItem('staff_active_id');
    setPickedStaffId(id);
  };

  // ── Filters (search, groups) ──────────────────────────────────────────────
  const { staffList, searchQuery, setSearchQuery, activeGroup, setActiveGroup, availableGroups } =
    useStaffFilters(adaptedStaff);

  // ── Core UI state ─────────────────────────────────────────────────────────
  const toast = useToast();
  const [dontAskDelete, setDontAskDelete] = useState(false);
  const [scheduleView,  setScheduleView]  = useState<'week' | 'month'>('week');
  const [currency, setCurrency] = useState<string>();

  useEffect(() => {
    settingsApi.getGeneral().then(s => setCurrency(s.currency ?? undefined)).catch(() => {});
  }, []);

  // ── Employee modals ───────────────────────────────────────────────────────
  const [isAddModalOpen,  setIsAddModalOpen]  = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Ассистент открывает мастер и карточку сам (эпик AI-6, задача 9):
  // /dashboard/staff?ai=staff.create.
  useAiIntent('staff.create', () => setIsAddModalOpen(true));
  useAiIntent('staff.open', (id) => { if (id != null) selectStaff(id); });

  // ── Delete confirmation modal ─────────────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState<DeleteModal>({
    isOpen: false, title: '', message: '', onConfirm: () => {},
  });
  const closeDeleteModal = () => setDeleteModal(m => ({ ...m, isOpen: false }));

  // ── Schedule local state (initialized from profile) ───────────────────────
  const [schedules, setSchedules] = useState<SchedulesMap>({});

  // Матрица часов — локально редактируемая, поэтому засеваем её из профиля один
  // раз на сотрудника. Прямо в рендере: эффект давал лишний кадр со старой сеткой.
  const [seededProfileId, setSeededProfileId] = useState<number | null>(null);
  if (profile && activeStaffId && seededProfileId !== profile.id) {
    setSeededProfileId(profile.id);
    setSchedules(prev => ({
      ...prev,
      [activeStaffId]: hoursToMatrix(weekHoursOf(profile)),
    }));
  }

  // ── Month calendar: курсор месяца + отметки «работает / выходной» ─────────
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };  // month 1..12
  });
  const shiftMonth = (delta: number) => setMonthCursor(({ year, month }) => {
    const d = new Date(year, month - 1 + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  // "YYYY-MM-DD" по локальной дате: ISO-строки сравниваются как строки, поэтому
  // этого хватает и для «сегодня», и для проверки «дата в прошлом».
  const todayStr = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  // Инструмент, которым красим дни: что выбрано сверху, то и ставится по клику.
  const [markTool, setMarkTool] = useState<'work' | 'off'>('work');
  // Ключ — "YYYY-MM-DD", значение — явная отметка владельца. Нет ключа = день
  // считается по недельному графику (а если и там выходной — не работает).
  const [dayMarks, setDayMarks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (scheduleView === 'month' && activeStaffId) {
      fetchMonth(monthCursor.year, monthCursor.month);
    }
  }, [scheduleView, activeStaffId, fetchMonth, monthCursor]);

  // Засеваем отметки из ответа прямо в рендере (как матрицу часов выше): эффект
  // давал бы лишний кадр с отметками предыдущего месяца.
  const [seededMonth, setSeededMonth] = useState<StaffMonthScheduleResponse | null>(null);
  if (monthData && monthData !== seededMonth) {
    setSeededMonth(monthData);
    setDayMarks(Object.fromEntries(monthData.day_overrides.map(o => [o.date, o.is_working])));
  }

  // 0=Пн … 6=Вс — как в week_working_hours.
  const weekOpenByDow = useMemo(
    () => new Map((profile ? weekHoursOf(profile) : []).map(wh => [wh.day_of_week, wh.is_open])),
    [profile]
  );

  // Дни месяца, где уже есть живые записи клиентов. start_time приходит как
  // naive ISO — первые 10 символов и есть локальная дата занятия.
  const bookedDays = useMemo(
    () => new Set(
      (monthData?.lessons ?? [])
        .filter(l => l.status !== 'cancelled' && l.booked_count > 0)
        .map(l => l.start_time.slice(0, 10))
    ),
    [monthData]
  );

  const toggleDayMark = async (dateStr: string) => {
    if (!activeStaffId) return;

    // Прошлое не трогаем вовсе — ни рабочим, ни выходным (то же правило на бэке).
    if (dateStr < todayStr) {
      toast.error(t('staff:schedule.pastDayLocked'));
      return;
    }

    // Отметка ставится, а не переключается: повторный клик по уже отмеченному дню
    // ничего не меняет — иначе выбор владельца откатывался бы к недельному графику.
    const next = markTool === 'work';
    if (dayMarks[dateStr] === next) return;

    // Клиенты уже записаны — нерабочим этот день сделать нельзя (то же на бэке).
    if (!next && bookedDays.has(dateStr)) {
      toast.error(t('staff:schedule.dayHasBookings'));
      return;
    }

    const prev = dayMarks;
    setDayMarks(m => ({ ...m, [dateStr]: next }));
    try {
      await staffApi.setDayOverride(activeStaffId, dateStr, next);
    } catch (err) {
      setDayMarks(prev);
      toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorSave'));
    }
  };

  // ── Today's events from profile ───────────────────────────────────────────
  const activeUpcoming = profile?.today_schedule ?? [];

  // ─── Derived from profile ─────────────────────────────────────────────────
  const isOwner = profile?.role === 'owner';
  const loadValue = profile?.stats.load_percent ?? 0;

  const heroInitials = profile
    ? [profile.name, profile.last_name].filter(Boolean).map(n => n![0]).join('').toUpperCase()
    : '';
  const heroGradient = profile?.avatar_gradient ?? FALLBACK_GRADIENT;
  const heroPhotoUrl = resolveImageUrl(profile?.photo_url);

  const roleCards: RoleCard[] = profile
    ? (ROLE_CARDS[profile.role] ?? ROLE_CARDS['default'] ?? [])
    : [];

  const hasLoadCard = roleCards.some(c => c.id === 'load');

  function resolveCardValue(card: RoleCard, p: StaffProfile): string {
    const currencySymbol = getCurrencySymbol(currency);
    if (!card.field) return '—';
    const statsVal = (p.stats as unknown as Record<string, number | undefined>)[card.field];
    if (statsVal !== undefined) {
      if (card.format === 'currency') return `${currencySymbol}${(statsVal / 1000).toFixed(0)}K`;
      if (card.format === 'percent')  return `${statsVal}%`;
      return String(statsVal);
    }
    const empVal = (p as unknown as Record<string, unknown>)[card.field];
    if (empVal == null) return '—';
    if (card.format === 'rating')   return `${empVal}★`;
    if (card.format === 'currency') return `${currencySymbol}${((empVal as number) / 1000).toFixed(0)}K`;
    if (card.format === 'percent')  return `${empVal}%`;
    return String(empVal);
  }

  // ─── Schedule period labels ───────────────────────────────────────────────
  const weekLabel = useMemo(() => {
    const locale = i18n.language;
    const now = new Date();
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
    const fmtYear = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    if (mon.getMonth() === sun.getMonth()) {
      return `${mon.getDate()}–${fmtYear.format(sun)}`;
    }
    return `${fmt.format(mon)} – ${fmtYear.format(sun)}`;
  }, [i18n.language]);

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' })
      .format(new Date(monthCursor.year, monthCursor.month - 1, 1));
  }, [i18n.language, monthCursor]);

  const showToast = toast.success;

  const copyToClipboard = (value: string, successMsg: string) => {
    navigator.clipboard.writeText(value)
      .then(() => showToast(successMsg))
      .catch(() => toast.error(t('common:toasts.copyFailed')));
  };

  // Действия над ожидающей карточкой — единственное, что с ней можно сделать,
  // пока сотрудник не принял приглашение.
  const [resendingId, setResendingId] = useState<number | null>(null);

  const resendInvite = async (staffId: number) => {
    if (resendingId !== null) return;
    setResendingId(staffId);
    try {
      await staffApi.resendInvite(staffId);
      showToast(t('staff:toasts.inviteResent'));
      // Человек мог принять приглашение как раз между опросами — тогда карточка
      // разблокируется прямо сейчас, а не через интервал.
      await refetchStaff();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorSave'));
    } finally {
      setResendingId(null);
    }
  };

  // Отмена присоединения = снятие членства в студии. Сам аккаунт и его работа в
  // других студиях не трогаются (delete_staff удаляет StudioMember, не User).
  const cancelInvite = (staffId: number) => {
    const person = rawStaff.find(s => s.id === staffId);
    setDeleteModal({
      isOpen: true,
      title: t('staff:deleteModal.cancelInvite'),
      message: person ? `${person.name} · ${person.email}` : '',
      confirmText: t('staff:deleteModal.cancelInviteConfirm'),
      onConfirm: async () => {
        closeDeleteModal();
        try {
          await deleteStaff(staffId);
          showToast(t('staff:toasts.inviteCancelled'));
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorDelete'));
        }
      },
    });
  };

  const deleteEvent = (i: number) => {
    const lesson = activeUpcoming[i];
    const doCancel = async () => {
      try {
        if (lesson?.id) await cancelLesson(lesson.id);
        showToast(t('staff:toasts.lessonCanceled'));
      } catch {
        showToast(t('staff:toasts.errorCancel'));
      }
    };
    if (dontAskDelete) { doCancel(); return; }
    setDeleteModal({
      isOpen: true,
      title: t('staff:deleteModal.cancelLesson'),
      message: `${lesson.name} · ${lesson.start_time}`,
      showDontAsk: true,
      onConfirm: () => { doCancel(); closeDeleteModal(); },
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    // Высота — не арифметика по вьюпорту (она врала при другом топбаре и с
    // баннером подписки), а честное «занять всю область .content» (flex-колонка).
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)', overflow: 'hidden' }}>

      {/* ── SUMMARY STATS ─────────────────────────────────────────────────── */}
      <StaffStats staff={adaptedStaff} />

      {/* ── MAIN LAYOUT ───────────────────────────────────────────────────── */}
      <div className="staff-layout" style={{ flex: 1, minHeight: 0 }}>

        {/* LEFT PANEL */}
        <StaffList
          staffList={staffList}
          activeStaffId={activeStaffId}
          onSelect={selectStaff}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          activeGroup={activeGroup}
          onGroupChange={setActiveGroup}
          availableGroups={availableGroups}
          onAddClick={() => setIsAddModalOpen(true)}
          onResendInvite={resendInvite}
          onCancelInvite={cancelInvite}
          resendingId={resendingId}
        />

        {/* RIGHT PANEL: PROFILE */}
        <div className="premium-right">
          {(listLoading || (profileLoading && !profile)) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: '14px' }}>
              {t('common:status.loading')}
            </div>
          )}

          {profile && (
            <>
              <div className="premium-hero">
                <div className="hero-bg" style={{ background: 'rgba(252,174,145,0.08)' }} />

                <div className="hero-actions">
                  {/* Приглашение и его отмена живут на карточке в левом списке:
                      профиль для ожидающего сотрудника не открывается вовсе. */}
                  {profile.phone && (
                    <button
                      className="h-btn"
                      style={{ color: '#1FA855' }}
                      onClick={() => window.open(`https://wa.me/${profile.phone!.replace(/\D/g, '')}`, '_blank', 'noopener')}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.695.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413"/></svg>
                      WhatsApp
                    </button>
                  )}

                  {/* Владелец правит только контакты — открывается OwnerContactsModal */}
                  <button
                    onClick={() => setIsEditModalOpen(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 20px', background: 'var(--bg-card)', color: 'var(--onyx)',
                      border: '1px solid rgba(var(--ink),0.1)', borderRadius: '12px',
                      fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                      transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      fontFamily: "'Manrope', sans-serif",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = 'rgba(var(--ink),0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; e.currentTarget.style.borderColor = 'rgba(var(--ink),0.1)'; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    {t('common:buttons.edit')}
                  </button>
                </div>

                <div className="hero-info">
                  <div
                    className="hero-ava"
                    style={{
                      background: heroPhotoUrl ? `url(${heroPhotoUrl}) center/cover no-repeat` : heroGradient,
                    }}
                  >
                    {!heroPhotoUrl && heroInitials}
                    {profile.is_online && <div className="badge-online" />}
                  </div>
                  <div>
                    <div className="hero-name">{profile.name} {profile.last_name}</div>
                    <div className="hero-role">
                      {t(`staff:roles.${profile.role}`, { defaultValue: profile.role })}{' '}
                      {profile.is_online
                        ? <span style={{ color: '#5BAB72', fontWeight: 700 }}>{t('staff:profile.online')}</span>
                        : t('staff:profile.offline')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="premium-body fade-in" key={profile.id}>

                {/* Stats cards — JSON-driven per role */}
                <div className="stats-row" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(140px, 100%), 1fr))` }}>
                  {roleCards.map((card) => (
                    <div key={card.id} className="stat-card">
                      <div className="stat-v">{resolveCardValue(card, profile)}</div>
                      <div className="stat-l">
                        {t(`staff:cards.${profile.role}.${card.id}`, { defaultValue: t(`staff:cards.default.${card.id}`, { defaultValue: card.id }) })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Info chips */}
                <div className="info-row">
                  <div className="chip status-on">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {t('common:status.active')}
                  </div>
                  <div className="chip" onClick={() => copyToClipboard(profile.email, t('staff:toasts.emailCopied'))}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {profile.email}
                  </div>
                  {profile.phone && (
                    <div className="chip" onClick={() => copyToClipboard(profile.phone!, t('staff:toasts.phoneCopied'))}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      {profile.phone}
                    </div>
                  )}
                </div>

                {/* Owner card */}
                {isOwner && (
                  <div className="owner-card">
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      {t('staff:profile.fullAccess')}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '2px' }}>{t('staff:profile.ownerAccess')}</div>
                    <div className="owner-perm">
                      {(['finance', 'staff', 'reports', 'clients', 'settings'] as const).map(key => (
                        <span key={key} className="perm-badge">{t(`staff:permissions.${key}`)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Load bar */}
                {hasLoadCard && loadValue > 0 && (
                  <div className="load-bar-wrap" style={{ marginTop: '4px' }}>
                    <div className="load-bar-top">
                      <span className="load-bar-label">{t('staff:profile.loadBar')}</span>
                      <span className="load-bar-pct">{loadValue}%</span>
                    </div>
                    <div className="load-bar-bg">
                      <div
                        className="load-bar-fill"
                        style={{ width: `${loadValue}%`, background: loadValue > 85 ? '#5BAB72' : loadValue > 60 ? '#FCAE91' : '#D88C9A' }}
                      />
                    </div>
                  </div>
                )}

                {/* Schedule grid */}
                {!isOwner && activeStaffId && schedules[activeStaffId] && (
                  <>
                    <div className="sec-title">
                      <span>{t('staff:profile.weekSchedule')}</span>
                    </div>

                    <div className="sch-wrap">
                      <div className="sch-top">
                        <div className="day-tabs">
                          <button className={`day-tab ${scheduleView === 'week' ? 'active' : ''}`} onClick={() => setScheduleView('week')}>{t('staff:schedule.week')}</button>
                          <button className={`day-tab ${scheduleView === 'month' ? 'active' : ''}`} onClick={() => setScheduleView('month')}>{t('staff:schedule.month')}</button>
                        </div>
                        {scheduleView === 'week' ? (
                          <span className="week-label">{weekLabel}</span>
                        ) : (
                          <div className="month-nav">
                            <button className="month-nav-btn" onClick={() => shiftMonth(-1)} aria-label={t('staff:schedule.prevMonth')}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                            </button>
                            <span className="week-label month-nav-label">{monthLabel}</span>
                            <button className="month-nav-btn" onClick={() => shiftMonth(1)} aria-label={t('staff:schedule.nextMonth')}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                            </button>
                          </div>
                        )}
                      </div>

                      {scheduleView === 'week' ? (
                        <>
                          <div className="sch-grid">
                            <div className="sch-head" />
                            {DAYS_KEYS.map((dayKey, i) => <div key={i} className="sch-head">{t(`common:days.short.${dayKey}`)}</div>)}
                            {TIME_OPTIONS.map((timeString, ti) => (
                              <React.Fragment key={ti}>
                                <div className="sch-time">{timeString}</div>
                                {[0,1,2,3,4,5,6].map(di => {
                                  const booked = activeStaffId ? schedules[activeStaffId]?.[ti]?.[di] : 0;
                                  return (
                                    <div
                                      key={di}
                                      className={`sch-cell ${booked ? 'booked' : ''}`}
                                    />
                                  );
                                })}
                              </React.Fragment>
                            ))}
                          </div>

                          <div className="sch-legend">
                            <div className="leg">
                              <div className="leg-dot" style={{ background: 'var(--accent)' }} />
                              {t('staff:schedule.working')}
                            </div>
                            <div className="leg">
                              <div className="leg-dot" style={{ background: 'rgba(252,174,145,.12)', border: '1px solid var(--border2)' }} />
                              {t('staff:schedule.free')}
                            </div>
                          </div>

                          {(profile?.halls.length ?? 0) > 0 && (
                            <div className="sch-legend" style={{ marginTop: '8px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)' }}>
                                {t('staff:profile.staffHalls')}
                              </span>
                              {profile!.halls.map(h => (
                                <div key={h.id} className="leg">
                                  <div className="leg-dot" style={{ background: h.color ?? '#F9A08B' }} />
                                  {h.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="mcal">
                          {/* Инструменты сверху: выбираешь отметку, потом красишь дни */}
                          <div className="mcal-tools">
                            {(['work', 'off'] as const).map(tool => (
                              <button
                                key={tool}
                                className={`mark-pick ${markTool === tool ? 'active' : ''}`}
                                onClick={() => setMarkTool(tool)}
                              >
                                <span className={`mark-dot ${tool}`} />
                                {t(tool === 'work' ? 'staff:schedule.markWork' : 'staff:schedule.dayOff')}
                              </button>
                            ))}
                            <span className="mcal-hint">{t('staff:schedule.markHint')}</span>
                          </div>

                          <div className="mcal-head">
                            {DAYS_KEYS.map(dayKey => (
                              <div key={dayKey}>{t(`common:days.short.${dayKey}`)}</div>
                            ))}
                          </div>

                          <div className="mcal-grid">
                            {(() => {
                              const { year, month } = monthCursor;                       // month 1..12
                              const daysInMonth = new Date(year, month, 0).getDate();
                              const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;
                              const cells: React.ReactNode[] = [];
                              for (let i = 0; i < firstDow; i++) {
                                cells.push(<div key={`e${i}`} className="mcal-day empty" />);
                              }
                              for (let day = 1; day <= daysInMonth; day++) {
                                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                const dow = (new Date(year, month - 1, day).getDay() + 6) % 7;
                                const marked = dayMarks[dateStr];
                                // Нет отметки — берём недельный график; нет и там — не работает.
                                const isWorking = marked ?? (weekOpenByDow.get(dow) ?? false);
                                const booked = bookedDays.has(dateStr);
                                const past = dateStr < todayStr;
                                cells.push(
                                  <button
                                    key={day}
                                    className={`mcal-day ${isWorking ? 'work' : 'off'}`
                                      + (marked !== undefined ? ' marked' : '')
                                      + (dateStr === todayStr ? ' today' : '')
                                      + (past ? ' past' : '')}
                                    onClick={() => toggleDayMark(dateStr)}
                                    title={past
                                      ? t('staff:schedule.pastDayLocked')
                                      : booked
                                        ? t('staff:schedule.dayHasBookings')
                                        : t(isWorking ? 'staff:schedule.markWork' : 'staff:schedule.dayOff')}
                                  >
                                    {day}
                                    {booked && <span className="mcal-booked" />}
                                  </button>
                                );
                              }
                              return cells;
                            })()}
                          </div>

                          <div className="sch-legend" style={{ padding: '10px 0 0' }}>
                            <div className="leg"><span className="mark-dot work" />{t('staff:schedule.markWork')}</div>
                            <div className="leg"><span className="mark-dot off" />{t('staff:schedule.dayOff')}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Upcoming events */}
                {activeUpcoming.length > 0 && (
                  <>
                    <div className="sec-title" style={{ marginTop: '24px' }}>
                      <span>{t('staff:profile.todaySchedule')}</span>
                    </div>
                    <div className="upcoming-list">
                      {activeUpcoming.map((u, i) => {
                        const hallColor = u.hall?.color ?? '#888888';
                        return (
                          <div key={u.id} className="upcoming-item">
                            <div className="up-time">
                              <div className="up-time-h">{u.start_time}</div>
                              <div className="up-time-m">{u.duration_min} {t('staff:profile.minutesSuffix')}</div>
                            </div>
                            <div className="up-dot" style={{ background: hallColor }} />
                            <div className="up-info">
                              <div className="up-name">{u.name}</div>
                              <div className="up-sub">{u.booked_count > 0 ? `${u.booked_count} ${t('staff:profile.clientsSuffix')} · ` : ''}{u.hall?.name ?? ''}</div>
                            </div>
                            <div className="up-hall" style={{ background: `${hallColor}18`, color: hallColor }}>{u.hall?.name ?? t('staff:profile.hall')}</div>
                            <div className="up-actions">
                              <button className="up-icon-btn del" onClick={() => deleteEvent(i)}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

              </div>
            </>
          )}
        </div>
      </div>

      {/* ── DELETE CONFIRM ────────────────────────────────────────────────── */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.title}
        message={deleteModal.message}
        confirmText={deleteModal.confirmText}
        dontAsk={deleteModal.showDontAsk ? dontAskDelete : undefined}
        onDontAskChange={deleteModal.showDontAsk ? setDontAskDelete : undefined}
        onConfirm={deleteModal.onConfirm}
        onClose={closeDeleteModal}
      />

      {/* ── ADD EMPLOYEE MODAL ───────────────────────────────────────────── */}
      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={async (data) => {
          try {
            const result = await create({
              name: data.name,
              last_name: data.last_name || undefined,
              email: data.email,
              // Пусто — email принадлежит существующему аккаунту: он входит
              // своим паролем, и задавать ему чужой нельзя (бэк это и требует).
              password: data.password || undefined,
              role: data.role,
              salary: data.salary ? Number(data.salary) : undefined,
              rate_type: (data.rate_type as 'fixed' | 'percent' | 'hourly') || undefined,
              service_ids: data.serviceIds,
              schedule: scheduleToWorkingHours(data.schedule),
            });
            if (result?.staff?.id) setPickedStaffId(result.staff.id);
            // Модалку не закрываем: она сама покажет последний шаг со ссылкой-приглашением
            // и закроется по «Готово» (AddEmployeeModal.handleClose → onClose).
            showToast(t('staff:toasts.inviteSent', { email: data.email }));
            return result;
          } catch (err) {
            // 402 (лимит тарифа) уже показан глобальной модалкой апселла — закрываем молча.
            if (err instanceof ApiError && err.status === 402) {
              setIsAddModalOpen(false);
              return;
            }
            toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorSave'));
            throw err;
          }
        }}
      />

      {/* ── EDIT OWNER CONTACTS ──────────────────────────────────────────── */}
      {isEditModalOpen && isOwner && profile && (
      <OwnerContactsModal
        owner={{
          id: profile.id,
          name: profile.name,
          last_name: profile.last_name ?? undefined,
          email: profile.email,
          phone: profile.phone ?? '',
          photo_url: resolveImageUrl(profile.photo_url),
          is_online: profile.is_online,
        }}
        onClose={() => setIsEditModalOpen(false)}
        onSave={async ({ email, phone }) => {
          if (!activeStaffId) return;
          try {
            // PUT заменяет запись целиком — остальные поля отправляем как есть,
            // role не отправляем вовсе, чтобы владелец остался владельцем.
            await update(activeStaffId, {
              name: profile.name,
              last_name: profile.last_name ?? undefined,
              email,
              phone: phone || undefined,
              rate: profile.rate ?? undefined,
              rate_type: profile.rate_type ?? undefined,
              service_ids: profile.services.map(s => s.id),
              photo_url: profile.photo_url ?? undefined,
              schedule: profile.week_working_hours,
            });
            refetchProfile();
            showToast(t('staff:toasts.changesSaved'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorSave'));
            throw err;
          }
        }}
      />
      )}

      {/* ── EDIT EMPLOYEE MODAL ──────────────────────────────────────────── */}
      <EditStaffModal
        isOpen={isEditModalOpen && !isOwner}
        staff={isEditModalOpen && profile ? {
          id: profile.id,
          name: profile.name,
          last_name: profile.last_name ?? undefined,
          phone: profile.phone ?? '',
          email: profile.email,
          role: profile.role,
          avatar_gradient: profile.avatar_gradient ?? undefined,
          is_online: profile.is_online,
          is_active: profile.is_active,
          rate: profile.rate ?? undefined,
          rate_type: profile.rate_type ?? '',
          service_ids: profile.services.map(s => s.id),
          photo_url: profile.photo_url ?? undefined,
          schedule: workingHoursToSchedule(weekHoursOf(profile)),
        } : null}
        onClose={() => setIsEditModalOpen(false)}
        onSave={async (updated) => {
          if (!activeStaffId) return;
          try {
            await update(activeStaffId, {
              name: updated.name,
              last_name: updated.last_name,
              email: updated.email,
              phone: updated.phone || undefined,
              role: updated.role,
              rate: updated.rate,
              rate_type: (updated.rate_type as 'fixed' | 'percent' | 'hourly') || undefined,
              service_ids: updated.service_ids ?? [],
              photo_url: updated.photo_url,
              schedule: scheduleToWorkingHours(updated.schedule),
            });
            refetchProfile();
            // График изменился — будущие отметки пересобраны на бэке, календарь
            // месяца показывает старые, пока его не перечитаешь.
            if (scheduleView === 'month') fetchMonth(monthCursor.year, monthCursor.month);
            setIsEditModalOpen(false);
            showToast(t('staff:toasts.changesSaved'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorSave'));
            throw err;
          }
        }}
        ownerCount={ownerCount}
        onDelete={async (id) => {
          try {
            await deleteStaff(id);
            selectStaff(null);
            showToast(t('staff:toasts.employeeDeleted'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorDelete'));
          }
        }}
      />

    </div>
  );
}
