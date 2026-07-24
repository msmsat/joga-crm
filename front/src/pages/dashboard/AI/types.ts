export type { AIChatSession, AIChatMessage, AISettings } from '../../../api/ai/ai.types';

export type AgentTone = 'friendly' | 'formal' | 'neutral';
export type AIModel = 'velora-3.5';
export type AILanguage = 'auto' | 'ru' | 'en' | 'uk';

export interface ChannelAgentConfig {
  enabled: boolean;
  token: string;
  username: string;
  tone: AgentTone;
  maxLength: number;
  offHoursOnly: boolean;
  handledCount: number;
  avgRating: number;
  expiresAt?: string | null; // только Instagram (OAuth, эпик AI-3) — long-lived токен истекает
}

export interface AgentConfig {
  telegram: ChannelAgentConfig;
  instagram: ChannelAgentConfig;
  systemPrompt: string;
}

export interface AIUISettings {
  model: AIModel;
  language: AILanguage;
}
