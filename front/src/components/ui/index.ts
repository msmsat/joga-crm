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
export { Select } from './Select';
export type { SelectOption, SelectProps } from './Select';
export { Switch } from './Switch';
export type { SwitchProps } from './Switch';
export { ConfirmModal } from './ConfirmModal';
export type { ConfirmModalProps } from './ConfirmModal';
export { ToastProvider, useToast } from './Toast';
export { Sidebar } from './Sidebar';
export { Navbar } from './Navbar';

// Диалоги: ModalShell — каркас, части собираются как конструктор.
// Dialog — синоним ModalShell для новых страниц.
export {
  ModalShell, ModalShell as Dialog, useModalClose,
  ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton,
  Input, ColorPicker, PhotoUpload, ChipsInput, WorkingHoursEditor,
} from './modal';
export type { WorkingHour } from './modal';
