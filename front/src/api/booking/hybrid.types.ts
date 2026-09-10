/** Matches schemas/schedule/hybrid.py and services/terminology.py. */
export type BookingMode = 'event' | 'resource';
/** Услуга — одна механика: resource+group запрещена сервером (§6.1). */
export type ServiceBookingMode = BookingMode;
export type StudioBookingMode = BookingMode | 'hybrid';
export type TerminologyProfile = 'generic' | 'fitness' | 'beauty';
export interface BookingCapabilities {
  booking_mode: StudioBookingMode;
  terminology_profile: TerminologyProfile;
  booking_config_version: number;
  strict_schedule_enabled: boolean;
}
export interface TermForms { singular: string; plural: string; accusative: string }
export type BusinessMessage = 'choose_staff' | 'choose_offering' | 'empty_slots' | 'my_bookings' | 'confirm_booking';
export interface Terminology {
  version: number;
  locale: string;
  profile: TerminologyProfile;
  profiles: Record<TerminologyProfile, {
    staff: TermForms;
    offering: Record<BookingMode, TermForms>;
    messages: Record<BusinessMessage, string>;
  }>;
}
export interface EventQuoteRequest { booking_mode: 'event'; lesson_id: number; spot_number?: number | null; payment_method?: 'venue' | 'card' }
export interface ResourceQuoteRequest { booking_mode: 'resource'; service_id: number; branch_id: number; teacher_id?: number | null; starts_at: string; payment_method?: 'venue' | 'card' }
export type QuoteRequest = EventQuoteRequest | ResourceQuoteRequest;
export interface AvailabilityQuery { service_id: number; branch_id: number; date_from: string; date_to: string; teacher_id?: number }
export interface AvailabilitySlot { starts_at: string; local_start: string; tz_iana: string; teacher_ids: number[] }
export interface AvailabilityRead { slots: AvailabilitySlot[]; reason: string | null }
export type BookingStatus = 'active' | 'pending' | 'hold' | 'attended' | 'cancelled';
export type NextAction = 'none' | 'wait_approval' | 'pay';
export interface BookingRead { reservation_id: number; lesson_id: number; booking_mode: BookingMode; status: BookingStatus; version: number; next_action: NextAction; payment_url: string | null }
export interface BookingTerms {
  domain: {
    base_price: number; lesson_id: number; local_start: string; service_name: string;
    trainer_name: string; branch_name: string | null; approval_required: boolean;
    funding: { kind: 'subscription' | 'trial' | 'free' | 'pay'; subscription_id: number | null; price: number; currency: string };
  };
  booking_mode: BookingMode; service_id: number | null; teacher_id: number | null; branch_id: number | null;
  hall_id: number | null; tz_iana: string | null; starts_at: string | null; duration_min: number;
  buffer_before_min: number; buffer_after_min: number; lesson_version: number;
  booking_config_version: number; cancellation_deadline_min: number; payment_method: 'venue' | 'card'; spot_number: number | null;
}
export interface QuoteRead { quote_id: string; expires_at: string; booking_mode: BookingMode; terms: BookingTerms; next_action: NextAction; reservation_id: number | null }
