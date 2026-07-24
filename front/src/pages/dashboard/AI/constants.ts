import type { AIModel, AILanguage } from './types';

// label — через t(`models.${value}`) / t(`languages.${value}`) в месте рендера.
export const MODEL_OPTIONS: { value: AIModel }[] = [
  { value: 'velora-3.5' },
];

export const LANGUAGE_OPTIONS: { value: AILanguage }[] = [
  { value: 'auto' },
  { value: 'ru' },
  { value: 'en' },
  { value: 'uk' },
];
