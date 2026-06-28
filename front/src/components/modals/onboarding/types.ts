export interface WorkingDay {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface OnboardingData {
  studioName: string;
  description: string;
  logoFile: File | null;
  logoPreviewUrl: string;
  activityType: string;
  phone: string;
  address: string;
  email: string;
  website: string;
  timezone: string;
  language: string;
  currency: string;
  dateFormat: string;
  firstDayOfWeek: string;
  workingHours: WorkingDay[];
}

export const DEFAULT_WORKING_HOURS: WorkingDay[] = [
  { dayOfWeek: 0, isOpen: true,  openTime: "09:00", closeTime: "21:00" },
  { dayOfWeek: 1, isOpen: true,  openTime: "09:00", closeTime: "21:00" },
  { dayOfWeek: 2, isOpen: true,  openTime: "09:00", closeTime: "21:00" },
  { dayOfWeek: 3, isOpen: true,  openTime: "09:00", closeTime: "21:00" },
  { dayOfWeek: 4, isOpen: true,  openTime: "09:00", closeTime: "21:00" },
  { dayOfWeek: 5, isOpen: true,  openTime: "10:00", closeTime: "18:00" },
  { dayOfWeek: 6, isOpen: false, openTime: "10:00", closeTime: "18:00" },
];

export const DAY_NAMES = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export const DAY_NAMES_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
