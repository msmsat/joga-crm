// types.ts

export interface Booking {
  id: string;
  trainer: number;
  timeStart: number;
  timeEnd: number;
  title: string;
  hall: string;
  clients: number;
  maxClients: number;
  color: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  date?: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  visits: number;
  avatar: string;
}