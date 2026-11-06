/**
 * Sends a scan log to Firestore (`scanLogs/{autoId}`, see scan-log.ts) without waiting: offline,
 * the Firestore SDK keeps the write and sends it later; any failure is ignored.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Platform } from 'react-native';
import { firestore } from '@/lib/firebase';
import { ScanLogger, type DeviceInfo } from './scan-log';

export function writeScanLog(doc: object): void {
  try {
    addDoc(collection(firestore(), 'scanLogs'), { ...doc, createdAt: serverTimestamp() }).catch(
      () => undefined,
    );
  } catch {
    // Never let the log break the scan.
  }
}

/** The phone, as far as React Native can tell without extra native modules. */
export function deviceInfo(): DeviceInfo {
  const c = Platform.constants as unknown as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (Platform.OS === 'android') {
    const model = [text(c.Brand), text(c.Model)].filter(Boolean).join(' ');
    const release = text(c.Release);
    return {
      platform: 'android',
      osVersion: release ? `${release} (API ${Platform.Version})` : String(Platform.Version),
      deviceModel: model || null,
    };
  }
  return { platform: Platform.OS, osVersion: String(Platform.Version), deviceModel: null };
}

/** A logger for one scan by `ownerId`. */
export const createScanLogger = (ownerId: string): ScanLogger =>
  new ScanLogger(writeScanLog, ownerId, deviceInfo());
