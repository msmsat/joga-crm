// ─── UI-кит Velora ────────────────────────────────────────────────────────────
// Единая точка импорта всех базовых компонентов. Новые страницы собираются
// ТОЛЬКО из этих компонентов — свои кнопки/инпуты/карточки не пишем.

export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';
export { Card } from './Card';
export type { CardProps } from './Card';
export { Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';
export { InfoHint } from './InfoHint';
export type { InfoHintProps } from './InfoHint';
// Позиционирование поповеров в портале (Tooltip/InfoHint строятся на нём) —
// для собственных всплывающих панелей страниц.
export { usePopoverPosition, placePopover } from './popoverPosition';
export type { Placement, Side } from './popoverPosition';
export { Select } from './Select';
export type { SelectOption, SelectProps } from './Select';
export { Switch } from './Switch';
export type { SwitchProps } from './Switch';
export { ConfirmModal } from './ConfirmModal';
export type { ConfirmModalProps } from './ConfirmModal';
export { ToastProvider, useToast } from './Toast';
export { Sidebar } from './Sidebar';
export { MobileNav } from './MobileNav';
export { Navbar } from './Navbar';
export { ErrorBoundary } from './ErrorBoundary';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { ActionCard } from './ActionCard';
export type { ActionCardProps } from './ActionCard';
export { AIPlanModal } from './AIPlanModal';
export type { AIPlanModalProps, PlanAnswers } from './AIPlanModal';
export { AIMessage } from './AIMessage';
export type { AIMessageProps } from './AIMessage';
export { AIChart } from './AIChart';
export type { AIChartProps } from './AIChart';
export { AIRating } from './AIRating';
export type { AIRatingProps } from './AIRating';
export { parseChartSpec } from './aiChartSpec';
export { stableMarkdown } from './stableMarkdown';
export type { AIChartSpec, AIChartPoint } from './aiChartSpec';

// Диалоги: ModalShell — каркас, части собираются как конструктор.
// Dialog — синоним ModalShell для новых страниц.
export {
  ModalShell, ModalShell as Dialog, useModalClose,
  ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton,
  Input, ColorPicker, PhotoUpload, ChipsInput, WorkingHoursEditor,
} from './modal';
export type { WorkingHour } from './modal';
