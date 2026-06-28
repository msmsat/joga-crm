import type { GeneralState, IntegrationsConfig, Session, ApiToken, Studio, TeamMember } from "./types";

export const DEFAULT_GENERAL: GeneralState = {
  name: "Pilates & Wellness Studio",
  desc: "",
  phone: "+7 (495) 000-00-00",
  email: "hello@studio.ru",
  site: "",
  address: "Москва, ул. Примерная, 1",
  logo: null,
};

export const INITIAL_TEAM_DATA: TeamMember[] = [
  { id: 1, name: "Анна Морозова", role: "Владелец", email: "anna@studio.ru", status: "active" },
  { id: 2, name: "Ирина Смирнова", role: "Администратор", email: "irina@studio.ru", status: "active" },
  { id: 3, name: "Мария Козлова", role: "Тренер", email: "maria@studio.ru", status: "active" },
  { id: 4, name: "Светлана Новикова", role: "Тренер", email: "svetlana@studio.ru", status: "warning" },
];

export const INITIAL_INTEGRATIONS_CONFIG: IntegrationsConfig = {
  whatsapp: { connected: true, phone: "+7 (900) 123-45-67", webhook: "https://api.velora.studio/v1/wa/webhook" },
  telegram: { connected: true, token: "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ", welcomeMsg: "Приветствуем! Выберите удобное время для записи ✨" },
  instagram: { connected: false, account: "" },
  google: { connected: false, calendarName: "Основной календарь", syncType: "Двусторонняя" },
  onec: { connected: false, url: "https://1c.studio.ru/base", login: "" },
  yandex: { connected: true, shopId: "208492", testMode: false },
};

export const INITIAL_PERMISSIONS_MATRIX: Record<string, Record<string, boolean>> = {
  "Владелец": {
    createBooking: true, cancelBooking: true, editOwnSchedule: true, editOthersSchedules: true, viewAllBookings: true,
    viewContacts: true, editClientProfiles: true, viewClientHistory: true, manageAbonements: true, applyDiscounts: true, sendMessages: true, exportDatabase: true, deleteClients: true,
    viewRevenue: true, viewDetailedFinances: true, issueRefunds: true, editPrices: true, viewSalaries: true, editSalaries: true,
    viewStaff: true, manageStaff: true,
    viewBasicReports: true, viewFullReports: true, exportReports: true,
    editStudioSettings: true, manageIntegrations: true, managePricelist: true, manageNotifications: true, accessAI: true, manageRoles: true,
  },
  "Администратор": {
    createBooking: true, cancelBooking: true, editOwnSchedule: true, editOthersSchedules: true, viewAllBookings: true,
    viewContacts: true, editClientProfiles: true, viewClientHistory: true, manageAbonements: true, applyDiscounts: true, sendMessages: true, exportDatabase: false, deleteClients: false,
    viewRevenue: true, viewDetailedFinances: false, issueRefunds: true, editPrices: false, viewSalaries: false, editSalaries: false,
    viewStaff: true, manageStaff: false,
    viewBasicReports: true, viewFullReports: false, exportReports: false,
    editStudioSettings: true, manageIntegrations: false, managePricelist: false, manageNotifications: true, accessAI: true, manageRoles: false,
  },
  "Тренер": {
    createBooking: true, cancelBooking: false, editOwnSchedule: true, editOthersSchedules: false, viewAllBookings: false,
    viewContacts: true, editClientProfiles: false, viewClientHistory: true, manageAbonements: false, applyDiscounts: false, sendMessages: false, exportDatabase: false, deleteClients: false,
    viewRevenue: false, viewDetailedFinances: false, issueRefunds: false, editPrices: false, viewSalaries: false, editSalaries: false,
    viewStaff: false, manageStaff: false,
    viewBasicReports: false, viewFullReports: false, exportReports: false,
    editStudioSettings: false, manageIntegrations: false, managePricelist: false, manageNotifications: false, accessAI: false, manageRoles: false,
  },
};

export const INITIAL_SESSIONS: Session[] = [
  { id: 1, device: "MacBook Pro 14\"", platform: null, browser: "Safari", location_city: "Москва", location_country: "РФ", last_active: new Date().toISOString(), is_current: true, icon: "laptop" },
  { id: 2, device: "iPhone 13 Pro", platform: null, browser: "App / iOS", location_city: "Санкт-Петербург", location_country: "РФ", last_active: new Date(Date.now() - 20 * 60 * 60_000).toISOString(), is_current: false, icon: "phone" },
];

export const INITIAL_API_TOKENS: ApiToken[] = [
  { id: 1, name: "Основной API", token_prefix: "vel_live_••••4f2a", created_at: "2026-03-14T00:00:00Z", is_active: true },
  { id: 2, name: "Telegram Bot", token_prefix: "vel_bot_••••9a1c", created_at: "2026-04-02T00:00:00Z", is_active: true },
];

export const INITIAL_STUDIOS_LIST: Studio[] = [
  { id: "1", name: "Pilates & Wellness Studio", theme: "light", desc: "Жемчужно-алебастровый UI · Основное пространство" },
  { id: "2", name: "Barbershop Blade & Co", theme: "dark", desc: "Матовый глубокий графит · Брутальный стиль" },
];
