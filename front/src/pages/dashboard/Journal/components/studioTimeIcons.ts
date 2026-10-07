// Иконка «времени студии» по виду блока (studioTimeModel.labelKind): одна и та
// же в сетке журнала (StaffBlockCard) и на готовых названиях окна
// StudioTimeModal — человек выбирает «Уборку» с баллончиком и видит в сетке
// тот же баллончик.
import { Layers, NotebookPen, SprayCan, UsersRound, Wind, Wrench, type LucideIcon } from 'lucide-react';
import type { StudioTimeKind } from '../studioTimeModel';

export const STUDIO_TIME_ICONS: Record<StudioTimeKind, LucideIcon> = {
  cleaning: SprayCan, prep: Layers, meeting: UsersRound, airing: Wind, maintenance: Wrench, custom: NotebookPen,
};
