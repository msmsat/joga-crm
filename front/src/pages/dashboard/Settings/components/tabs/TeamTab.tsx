import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import PremiumButton from "../ui/PremiumButton";
import StatusBadge from "../ui/StatusBadge";
import Toggle from "../ui/form/Toggle";
import type { TeamMember } from "../../types";

interface TeamTabProps {
  teamData: TeamMember[];
  expandedRole: string | null;
  setExpandedRole: (r: string | null) => void;
  permissionsMatrix: Record<string, Record<string, boolean>>;
  handlePermissionToggle: (role: string, key: string) => void;
  onAddStaff: () => void;
  onEditStaff: (member: TeamMember) => void;
  savedStates: Record<string, boolean>;
  triggerSave: (key: string, msg: string) => void;
}

export default function TeamTab({
  teamData, expandedRole, setExpandedRole, permissionsMatrix,
  handlePermissionToggle, onAddStaff, onEditStaff, savedStates, triggerSave
}: TeamTabProps) {
  const sectionIcons = {
    book: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    users: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    finance: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    system: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    staff: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    reports: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  };

  const sections = [
    { title: "Записи", icon: sectionIcons.book, items: [
      { key: "createBooking",      label: "Создание и редактирование", desc: "Ведение календаря записей" },
      { key: "cancelBooking",      label: "Отмена визитов",            desc: "Удаление записи без штрафов" },
      { key: "editOwnSchedule",    label: "Своё расписание",           desc: "Редактирование своих смен" },
      { key: "editOthersSchedules",label: "Расписание тренеров",       desc: "Редактирование чужих смен", warn: true },
      { key: "viewAllBookings",    label: "Все записи студии",         desc: "Полный журнал без фильтрации" },
    ]},
    { title: "Клиенты", icon: sectionIcons.users, items: [
      { key: "viewContacts",      label: "Просмотр контактов",      desc: "Телефоны и email в базе" },
      { key: "editClientProfiles",label: "Редактирование профилей", desc: "Изменение данных клиента" },
      { key: "viewClientHistory", label: "История клиента",         desc: "Посещения и платежи" },
      { key: "manageAbonements",  label: "Управление абонементами", desc: "Выдача, заморозка, списание" },
      { key: "applyDiscounts",    label: "Скидки и спецусловия",    desc: "Применение скидок к оплате" },
      { key: "sendMessages",      label: "Рассылки клиентам",       desc: "Ручные и шаблонные сообщения" },
      { key: "exportDatabase",    label: "Экспорт базы (Excel)",    desc: "Выгрузка всех контактов", danger: true },
      { key: "deleteClients",     label: "Удаление профилей",       desc: "Безвозвратное стирание данных", danger: true },
    ]},
    { title: "Финансы", icon: sectionIcons.finance, items: [
      { key: "viewRevenue",          label: "Просмотр выручки",     desc: "Дашборд кассы и итоги" },
      { key: "viewDetailedFinances", label: "Детальная аналитика",  desc: "P&L, движение средств, прогнозы" },
      { key: "issueRefunds",         label: "Возврат средств",      desc: "Отмена и возврат транзакций" },
      { key: "editPrices",           label: "Изменение цен",        desc: "Цены на услуги и пакеты", warn: true },
      { key: "viewSalaries",         label: "Зарплаты сотрудников", desc: "Просмотр ФОТ и начислений" },
      { key: "editSalaries",         label: "Управление зарплатами",desc: "Изменение ставок и выплат", danger: true },
    ]},
    { title: "Система", icon: sectionIcons.system, items: [
      { key: "editStudioSettings",  label: "Настройки студии",    desc: "График работы и параметры" },
      { key: "manageIntegrations",  label: "Интеграции",          desc: "WhatsApp, Telegram, API", warn: true },
      { key: "managePricelist",     label: "Прайс-лист",          desc: "Услуги и пакеты абонементов" },
      { key: "manageNotifications", label: "Шаблоны уведомлений", desc: "Тексты рассылок и автосообщений" },
      { key: "accessAI",            label: "ИИ-ассистент",        desc: "Velora AI и автоматизация" },
      { key: "manageRoles",         label: "Роли и права",        desc: "Управление доступом команды", danger: true },
    ]},
    { title: "Сотрудники", icon: sectionIcons.staff, items: [
      { key: "viewStaff",   label: "Просмотр команды",    desc: "Список, роли и контакты" },
      { key: "manageStaff", label: "Управление командой", desc: "Добавление и редактирование", warn: true },
    ]},
    { title: "Отчёты", icon: sectionIcons.reports, items: [
      { key: "viewBasicReports", label: "Базовая аналитика", desc: "Ключевые метрики и сводки" },
      { key: "viewFullReports",  label: "Полная аналитика",  desc: "Динамика, когорты, воронки" },
      { key: "exportReports",    label: "Экспорт отчётов",   desc: "Выгрузка в Excel и PDF" },
    ]},
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "12px",
              background: "rgba(252,174,145,0.12)", color: "var(--peach)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{icons.users}</div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>Команда</div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>Управляйте сотрудниками и правами</div>
            </div>
          </div>
          <button
            onClick={onAddStaff}
            style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: "9px 18px", borderRadius: "10px",
              background: "var(--peach)", border: "none", color: "white",
              fontSize: "12px", fontWeight: 700, cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)",
              boxShadow: "0 4px 16px rgba(252,174,145,0.35)",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(252,174,145,0.45)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(252,174,145,0.35)"; }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(0.96)"}
            onMouseUp={e => e.currentTarget.style.transform = "translateY(-2px)"}
          >
            {icons.plus}
            Добавить сотрудника
          </button>
        </div>

        {teamData.map((member, i) => (
          <div key={member.id} style={{
            display: "flex", alignItems: "center", gap: "14px",
            padding: "14px 16px", borderRadius: "12px",
            transition: "all 0.2s ease",
            border: "1px solid transparent",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.015)"; e.currentTarget.style.borderColor = "rgba(0,0,0,0.03)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
          >
            <div style={{
              width: "38px", height: "38px", borderRadius: "12px",
              background: `hsl(${i * 60 + 20}, 60%, 88%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px", fontWeight: 800, color: `hsl(${i * 60 + 20}, 40%, 40%)`,
              flexShrink: 0,
            }}>
              {member.name.split(" ").map(w => w[0]).join("")}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{member.name}</div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>{member.email}</div>
            </div>
            <StatusBadge type={member.status}>{member.role}</StatusBadge>
            <button
              onClick={() => onEditStaff(member)}
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "6px 12px", background: "#FFFFFF", color: "var(--onyx)",
                border: "1px solid rgba(26,26,26,0.1)", borderRadius: "8px",
                fontSize: "11px", fontWeight: 700, cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)"; e.currentTarget.style.borderColor = "rgba(26,26,26,0.2)"; e.currentTarget.style.color = "var(--peach)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.02)"; e.currentTarget.style.borderColor = "rgba(26,26,26,0.1)"; e.currentTarget.style.color = "var(--onyx)"; }}
            >
              {icons.edit}
              Изменить
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.key} title="Роли и права" subtitle="Точная настройка уровней доступа для сотрудников" />
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { role: "Владелец",      desc: "Полный доступ ко всему, права не подлежат изменению", color: "#FCAE91" },
            { role: "Администратор", desc: "Управление записями, клиентами и кассой",              color: "#A3C9A8" },
            { role: "Тренер",        desc: "Своё расписание и своя клиентская база",               color: "#9BB5D8" },
          ].map((r) => {
            const isExpanded = expandedRole === r.role;
            const isOwner = r.role === "Владелец";
            const perms = permissionsMatrix[r.role];
            return (
              <div key={r.role} style={{
                borderRadius: "14px",
                background: isExpanded ? "#FFFFFF" : "rgba(0,0,0,0.015)",
                border: `1px solid ${isExpanded ? "var(--peach)" : "rgba(0,0,0,0.04)"}`,
                boxShadow: isExpanded ? "0 12px 32px rgba(252,174,145,0.12), 0 2px 6px rgba(252,174,145,0.08)" : "none",
                transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)",
                overflow: "hidden"
              }}>
                <div
                  onClick={() => setExpandedRole(isExpanded ? null : r.role)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px", cursor: "pointer",
                    background: isExpanded ? "rgba(252,174,145,0.03)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: r.color, boxShadow: `0 0 0 3px ${r.color}30` }} />
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)" }}>{r.role}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{r.desc}</div>
                    </div>
                  </div>
                  <button style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "6px 14px", borderRadius: "8px",
                    background: isExpanded ? "var(--peach)" : "#FFFFFF",
                    color: isExpanded ? "#FFFFFF" : "var(--onyx)",
                    border: isExpanded ? "1px solid var(--peach)" : "1px solid rgba(26,26,26,0.1)",
                    fontSize: "11.5px", fontWeight: 700, cursor: "pointer",
                    transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)",
                    boxShadow: isExpanded ? "0 4px 12px rgba(252,174,145,0.4)" : "0 2px 6px rgba(0,0,0,0.02)",
                    pointerEvents: "none"
                  }}>
                    {isExpanded ? "Закрыть" : "Настроить"}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                         style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s ease" }}>
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateRows: isExpanded ? "1fr" : "0fr", transition: "grid-template-rows 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)" }}>
                  <div style={{ minHeight: 0 }}>
                    <div style={{ padding: "0 20px 20px 20px", opacity: isExpanded ? 1 : 0, transition: "opacity 0.2s ease", transitionDelay: isExpanded ? "0.1s" : "0s" }}>
                      <div style={{ width: "100%", height: "1px", background: "rgba(0,0,0,0.06)", marginBottom: "20px" }} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 32px", alignItems: "start", opacity: isOwner ? 0.7 : 1, pointerEvents: isOwner ? "none" : "auto" }}>
                        {sections.map((sec, i) => (
                          <div key={i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", color: "var(--muted)" }}>
                              <div style={{ color: "var(--peach)" }}>{sec.icon}</div>
                              <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{sec.title}</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {sec.items.map((item) => {
                                const isChecked = perms[item.key] ?? false;
                                return (
                                  <div key={item.key} onClick={() => handlePermissionToggle(r.role, item.key)} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "8px 10px", borderRadius: "8px", cursor: isOwner ? "default" : "pointer",
                                    background: isChecked ? "rgba(252,174,145,0.04)" : "transparent",
                                    transition: "background 0.2s ease", margin: "0 -10px"
                                  }}
                                    onMouseEnter={e => { if (!isOwner) e.currentTarget.style.background = isChecked ? "rgba(252,174,145,0.08)" : "rgba(0,0,0,0.02)"; }}
                                    onMouseLeave={e => { if (!isOwner) e.currentTarget.style.background = isChecked ? "rgba(252,174,145,0.04)" : "transparent"; }}
                                  >
                                    <div style={{ paddingRight: "16px" }}>
                                      <div style={{ fontSize: "12.5px", fontWeight: 700, color: (item as any).danger ? "#C0607A" : (item as any).warn ? "#C08030" : "var(--onyx)" }}>{item.label}</div>
                                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px", lineHeight: "1.3" }}>{item.desc}</div>
                                    </div>
                                    <Toggle checked={isChecked} onChange={() => handlePermissionToggle(r.role, item.key)} />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {!isOwner && (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
                          <PremiumButton
                            isSaved={savedStates[`perm_${r.role}`]}
                            onClick={() => { triggerSave(`perm_${r.role}`, `Права для роли "${r.role}" обновлены`); setExpandedRole(null); }}
                            text="Сохранить права"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
