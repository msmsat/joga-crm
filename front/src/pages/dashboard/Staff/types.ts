// ─── BACKEND DATA TYPES ─────────────────────────────────────────────────────

export interface RoleCard {
  id: string;
  label: string;
  api: string;
  field: string | null;
  format: 'currency' | 'rating' | 'percent' | 'number' | 'text';
  icon: string;
  category: 'finance' | 'performance' | 'schedule' | 'clients';
}

export interface StaffStats {
  total_bookings: number;
  total_attended: number;
  load_percent: number;
  total_revenue: number;
}

export interface StaffHall {
  id: number;
  name: string;
  color?: string;
}

export interface StaffWorkingHoursItem {
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

export interface StaffTodayLesson {
  id: number;
  name: string;
  start_time: string;
  duration_min: number;
  booked_count: number;
  total_spots: number;
  hall: StaffHall | null;
}

export interface StaffMonthLesson {
  id: number;
  name: string;
  start_time: string;
  duration_min: number;
  status: string;
  total_spots: number;
  booked_count: number;
  hall: StaffHall | null;
}

export interface Employee {
  id: number;
  name: string;
  last_name?: string;
  email: string;
  phone?: string;
  role: string;
  department?: string | null;
  is_online: boolean;
  photo_url?: string;
  avatar_gradient?: string;
  salary?: number;
  rate?: number;
  rate_type?: 'fixed' | 'percent' | 'hourly' | null;
  avg_rating?: number;
  stats: StaffStats;
}

export interface StaffProfileResponse extends Employee {
  is_active: boolean;
  halls: StaffHall[];
  today_schedule: StaffTodayLesson[];
  week_working_hours: StaffWorkingHoursItem[];
}

// ─── API REQUEST TYPES ───────────────────────────────────────────────────────

export interface StaffCreate {
  name: string;
  last_name?: string;
  email: string;
  phone?: string;
  role: string;
  department?: string;
  salary?: number;
  rate?: number;
  rate_type?: 'fixed' | 'percent' | 'hourly';
}

export type StaffUpdate = StaffCreate;

// ─── API RESPONSE TYPES ──────────────────────────────────────────────────────

export interface StaffSummary {
  total: number;
  online: number;
  by_role: Record<string, number>;
}

export interface StaffListResponse {
  summary: StaffSummary;
  staff: Employee[];
}

export interface StaffMutateResponse {
  ok: boolean;
  staff: Employee;
}

// ─── UI-ONLY TYPES ───────────────────────────────────────────────────────────

export interface Hall {
  name: string;
  color: string;
}

export type HallsMap = Record<string, Hall>;

export type ScheduleMatrix = (0 | 1 | number)[][];

export type SchedulesMap = Record<number, ScheduleMatrix>;

export type UpcomingMap = Record<number, StaffTodayLesson[]>;

// ─── UI STATE TYPES ──────────────────────────────────────────────────────────

export type ModalActionType = 'ALERT' | 'PROMPT_MESSAGE' | 'PROMPT_CALL' | string;

export interface ModalState {
  isOpen: boolean;
  title: string;
  sub: string;
  type?: ModalActionType;
  danger?: boolean;
  confirmText?: string;
  phone?: string;
  onConfirm?: () => void;
}

export interface TooltipState {
  show: boolean;
  x: number;
  y: number;
  title: string;
  sub: string;
}
