export interface ClientData {
  id: number;
  n: string; i: string; c: string; type: string; badge: string; bl: string;
  v: number; spent: string; ab: number; abMax: number;
  phone: string; email: string; bday: string; city: string;
  reg: string; lastVisit: string; points: number; note: string;
  tags: string[];
}

export interface VisitRecord {
  date: string;
  name: string;
  trainer: string;
  paid: string;
}
