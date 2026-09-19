export interface CategoryPreset { value: string; label: string }

// Keep user-defined categories intact; only known preset labels map to server values.
export function categoryValue(text: string, presets: CategoryPreset[]): string {
  const value = text.trim();
  return presets.find(preset => preset.label === value)?.value ?? text;
}

export function categoryLabel(value: string, presets: CategoryPreset[]): string {
  return presets.find(preset => preset.value === value)?.label ?? value;
}
