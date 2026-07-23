import { client } from '../client'
import type {
  ActionMessageOut,
  ActivityPoint,
  BookingCreatedOut,
  CategoryStat,
  ClientCreate,
  ClientCreatedOut,
  ClientListItem,
  ClientNote,
  ClientProfile,
  ClientsCountOut,
  ClientsListParams,
  ClientsPage,
  ClientUpdate,
  ClientWallet,
  EventRecord,
  InviteCode,
  NoteCreatedOut,
  OkFrozenOut,
  OkOut,
  PointsBalanceOut,
  TagsOut,
  WalletSubscription,
} from './clients.types'

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return ''
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return q ? `?${q}` : ''
}

export const clientsApi = {
  // ─── LIST & COUNTS ────────────────────────────────────────────────────────
  // Слэш перед query обязателен: без него FastAPI отвечает 307-редиректом
  // на /clients/ — каждый запрос ходит на сервер дважды.
  getList: (params?: ClientsListParams) =>
    client.get<ClientsPage<ClientListItem>>(`/clients/${buildQuery(params as Record<string, unknown>)}`),

  getCount: () =>
    client.get<ClientsCountOut>('/clients/count'),

  getCategories: () =>
    client.get<CategoryStat[]>('/clients/categories'),

  // ─── PROFILE ──────────────────────────────────────────────────────────────
  getProfile: (id: number) =>
    client.get<ClientProfile>(`/clients/${id}`),

  getWallet: (id: number) =>
    client.get<ClientWallet>(`/clients/${id}/wallet`),

  transferSubscription: (clientId: number, subId: number, targetClientId: number) =>
    client.post<WalletSubscription>(`/clients/${clientId}/subscriptions/${subId}/transfer`, { target_client_id: targetClientId }),

  getInviteCode: (id: number) =>
    client.get<InviteCode>(`/clients/${id}/invite-code`),

  // ─── EVENTS & ACTIVITY ────────────────────────────────────────────────────
  getEvents: (id: number, eventType?: 'payment' | 'visit' | 'booking' | 'cancel' | 'bonus' | 'freeze' | 'all') =>
    client.get<EventRecord[]>(
      `/clients/${id}/events${eventType ? `?event_type=${eventType}` : ''}`,
    ),

  getActivity: (id: number) =>
    client.get<ActivityPoint[]>(`/clients/${id}/activity`),

  // ─── NOTES ────────────────────────────────────────────────────────────────
  getNotes: (id: number) =>
    client.get<ClientNote[]>(`/clients/${id}/notes`),

  createNote: (id: number, text: string) =>
    client.post<NoteCreatedOut>(`/clients/${id}/notes`, { text }),

  updateNote: (clientId: number, noteId: number, text: string) =>
    client.patch<OkOut>(`/clients/${clientId}/notes/${noteId}`, { text }),

  deleteNote: (clientId: number, noteId: number) =>
    client.delete<OkOut>(`/clients/${clientId}/notes/${noteId}`),

  // ─── CREATE / DELETE ──────────────────────────────────────────────────────
  create: (payload: ClientCreate) =>
    client.post<ClientCreatedOut>('/clients', payload),

  delete: (id: number) =>
    client.delete<OkOut>(`/clients/${id}`),

  // ─── MUTATIONS ────────────────────────────────────────────────────────────
  update: (id: number, payload: ClientUpdate) =>
    client.patch<OkOut>(`/clients/${id}`, payload),

  updateStatus: (id: number, status: string) =>
    client.patch<OkOut>(`/clients/${id}/status`, { status }),

  freeze: (id: number, frozen: boolean) =>
    client.patch<OkFrozenOut>(`/clients/${id}/freeze`, { frozen }),

  updateRegistrationDate: (id: number, registration_date: string) =>
    client.patch<OkOut>(`/clients/${id}/registration-date`, { registration_date }),

  // ─── TAGS ─────────────────────────────────────────────────────────────────
  addTag: (id: number, tag: string) =>
    client.post<TagsOut>(`/clients/${id}/tags`, { tag }),

  removeTag: (id: number, tag: string) =>
    client.delete<TagsOut>(`/clients/${id}/tags`, { tag }),

  // ─── ACTIONS ──────────────────────────────────────────────────────────────
  call: (id: number) =>
    client.post<ActionMessageOut>(`/clients/${id}/call`),

  sendMessage: (id: number, text: string, channel: string) =>
    client.post<ActionMessageOut>(`/clients/${id}/message`, { text, channel }),

  sendSubscriptionReminder: (id: number) =>
    client.post<ActionMessageOut>(`/clients/${id}/subscription-reminder`),

  book: (id: number, lesson_id: number) =>
    client.post<BookingCreatedOut>(`/clients/${id}/booking`, { lesson_id }),

  addBonus: (id: number, amount: number, description?: string) =>
    client.post<PointsBalanceOut>(`/clients/${id}/bonus`, { amount, ...(description ? { description } : {}) }),
}
