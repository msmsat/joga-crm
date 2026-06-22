export type MessageRole = 'user' | 'ai';
export type MessageStatus = 'sending' | 'thinking' | 'typing' | 'done';
export type AgentTone = 'friendly' | 'formal' | 'neutral';
export type AIModel = 'gpt-4o' | 'gpt-4o-mini' | 'claude-3-5-sonnet' | 'gemini-1.5-pro';
export type AILanguage = 'auto' | 'ru' | 'en' | 'uk';

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: Date;
  status?: MessageStatus;
}

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messageCount: number;
}

export interface ChannelAgentConfig {
  enabled: boolean;
  token: string;
  username: string;
  tone: AgentTone;
  maxLength: number;
  offHoursOnly: boolean;
  handledCount: number;
  avgRating: number;
}

export interface AgentConfig {
  telegram: ChannelAgentConfig;
  instagram: ChannelAgentConfig;
  systemPrompt: string;
}

export interface AISettings {
  model: AIModel;
  language: AILanguage;
}
