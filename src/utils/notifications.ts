import type { InventoryItem } from '../types/inventory';
import { calculateDaysUntilExpiry, getExpiryStatus, hasValidExpiryDate } from './analytics';

export type PushSupportState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermissionState(): PushSupportState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as PushSupportState;
}

export async function requestPushPermission(): Promise<PushSupportState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    await registerNotificationWorker();
    return 'granted';
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    await registerNotificationWorker();
  }
  return result as PushSupportState;
}

export async function registerNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

export async function dispatchLocalPushNotification(
  title: string,
  body: string,
  tag: string = 'despensaforte-expiry'
): Promise<{ sent: boolean; method: 'service-worker' | 'window-notification' | 'unavailable' }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { sent: false, method: 'unavailable' };
  }
  if (Notification.permission !== 'granted') {
    return { sent: false, method: 'unavailable' };
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          tag,
          requireInteraction: false,
        });
        return { sent: true, method: 'service-worker' };
      }
    }
    new Notification(title, { body, tag });
    return { sent: true, method: 'window-notification' };
  } catch {
    try {
      new Notification(title, { body, tag });
      return { sent: true, method: 'window-notification' };
    } catch {
      return { sent: false, method: 'unavailable' };
    }
  }
}

export function buildExpiryAlertMessage(
  inventory: InventoryItem[],
  warningDays: number,
  criticalDays: number
): { count: number; title: string; body: string } | null {
  const expiring = inventory
    .filter((item) => item.quantity > 0 && hasValidExpiryDate(item.expiryDate))
    .map((item) => ({
      item,
      days: calculateDaysUntilExpiry(item.expiryDate),
      status: getExpiryStatus(item.expiryDate, warningDays, criticalDays),
    }))
    .filter((entry) => entry.status === 'expired' || entry.status === 'critical' || entry.status === 'warning')
    .sort((a, b) => a.days - b.days);

  if (expiring.length === 0) return null;

  const top = expiring[0];
  const dayLabel =
    top.days < 0
      ? `vencido há ${Math.abs(top.days)} dias`
      : top.days === 0
        ? 'vence hoje'
        : `vence em ${top.days} dias`;

  const title =
    expiring.length === 1
      ? `Alerta de Validade: ${top.item.name}`
      : `${expiring.length} itens próximos do vencimento`;

  const body =
    expiring.length === 1
      ? `${top.item.name} (${top.item.quantity} ${top.item.unit}) ${dayLabel}. Priorize o consumo ou rotação PEPS.`
      : `Mais urgente: ${top.item.name} (${dayLabel}) e outros ${expiring.length - 1} itens na despensa.`;

  return { count: expiring.length, title, body };
}
