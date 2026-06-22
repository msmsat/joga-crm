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
  { id: "1", name: "Анна Морозова", role: "Владелец", email: "anna@studio.ru", status: "active" },
  { id: "2", name: "Ирина Смирнова", role: "Администратор", email: "irina@studio.ru", status: "active" },
  { id: "3", name: "Мария Козлова", role: "Тренер", email: "maria@studio.ru", status: "active" },
  { id: "4", name: "Светлана Новикова", role: "Тренер", email: "svetlana@studio.ru", status: "warning" },
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
  "Администратор": {
    createBooking: true, cancelBooking: true, editAllSchedules: true,
    viewContacts: true, exportDatabase: false, deleteClients: false,
    viewRevenue: true, issueRefunds: true, editPrices: false,
    editStudioHours: true, manageIntegrations: false,
  },
  "Тренер": {
    createBooking: true, cancelBooking: false, editAllSchedules: false,
    viewContacts: true, exportDatabase: false, deleteClients: false,
    viewRevenue: false, issueRefunds: false, editPrices: false,
    editStudioHours: false, manageIntegrations: false,
  },
  "Владелец": {
    createBooking: true, cancelBooking: true, editAllSchedules: true,
    viewContacts: true, exportDatabase: true, deleteClients: true,
    viewRevenue: true, issueRefunds: true, editPrices: true,
    editStudioHours: true, manageIntegrations: true,
  },
};

export const INITIAL_SESSIONS: Session[] = [
  { id: 1, device: "MacBook Pro 14\"", browser: "Safari", loc: "Москва, РФ", time: "Сейчас активна", current: true, icon: "laptop" },
  { id: 2, device: "iPhone 13 Pro", browser: "App / iOS", loc: "Санкт-Петербург, РФ", time: "Вчера в 14:20", current: false, icon: "phone" },
];

export const INITIAL_API_TOKENS: ApiToken[] = [
  { id: 1, name: "Основной API", key: "vel_live_••••4f2a", created: "14 мар 2026" },
  { id: 2, name: "Telegram Bot", key: "vel_bot_••••9a1c", created: "2 апр 2026" },
];

export const INITIAL_STUDIOS_LIST: Studio[] = [
  { id: "1", name: "Pilates & Wellness Studio", theme: "light", desc: "Жемчужно-алебастровый UI · Основное пространство" },
  { id: "2", name: "Barbershop Blade & Co", theme: "dark", desc: "Матовый глубокий графит · Брутальный стиль" },
];
