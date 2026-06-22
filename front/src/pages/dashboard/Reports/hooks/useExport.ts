import { useCallback } from 'react';

export function useExport() {
  const exportCSV = useCallback((rows: Record<string, unknown>[], filename: string) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]).join(',');
    const body    = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + headers + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const exportPDF = useCallback(() => {
    window.print();
  }, []);

  return { exportCSV, exportPDF };
}
