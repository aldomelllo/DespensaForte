import type { SharedMonthlyReportPayload } from '../types/inventory';

const SHARE_PREFIX = '#share=';

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(base64Url: string): string {
  const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeSharedReport(payload: SharedMonthlyReportPayload): string {
  const json = JSON.stringify(payload);
  return `${SHARE_PREFIX}${toBase64Url(json)}`;
}

export function buildSharedReportUrl(payload: SharedMonthlyReportPayload): string {
  const hash = encodeSharedReport(payload);
  if (typeof window === 'undefined') return hash;
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

export function decodeSharedReportFromHash(hash: string): SharedMonthlyReportPayload | null {
  if (!hash || !hash.startsWith(SHARE_PREFIX)) return null;
  try {
    const encoded = hash.slice(SHARE_PREFIX.length);
    if (!encoded) return null;
    const json = fromBase64Url(encoded);
    const parsed = JSON.parse(json) as SharedMonthlyReportPayload;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.report ||
      !Array.isArray(parsed.report.items) ||
      !Array.isArray(parsed.series)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
