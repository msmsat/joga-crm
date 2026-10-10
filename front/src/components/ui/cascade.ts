import type { CSSProperties } from 'react';

/**
 * Номер элемента в каскаде появления панели (SidePanel, «Ещё»): drawerMotion.ts
 * читает `--i` и задерживает въезд строки на столько шагов.
 */
export const cascade = (i: number) => ({ '--i': i }) as CSSProperties;
