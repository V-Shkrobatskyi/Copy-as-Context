import type { SupportedExportFormat } from './core';

export function contextBlob(content: string, format: SupportedExportFormat): Blob {
  return new Blob([content], { type: `${format === 'markdown' ? 'text/markdown' : 'text/plain'};charset=utf-8` });
}

export function contextDownloadOptions(url: string, format: SupportedExportFormat, now = new Date()) {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return {
    url,
    filename: `${timestamp}.${format === 'markdown' ? 'md' : 'txt'}`,
    saveAs: true,
  };
}
