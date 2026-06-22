export type DrawerRole = 'user' | 'ai';
export type DrawerMsgStatus = 'thinking' | 'typing' | 'done';

export interface DrawerMessage {
  id: string;
  role: DrawerRole;
  text: string;
  timestamp: Date;
  status: DrawerMsgStatus;
}

export interface DrawerSession {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messageCount: number;
}
