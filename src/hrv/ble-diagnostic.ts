/**
 * One-shot BLE diagnostic for the WHOOP live-HRV investigation.
 *
 * Unlike ble-hr.ts (the live path that targets only the standard Heart Rate
 * Service), this connects to the band and *interrogates every channel*:
 *   - enumerates all GATT services + characteristics,
 *   - subscribes to every notifiable/indicatable characteristic,
 *   - captures raw packets from each for a fixed window,
 *   - decodes the two channels we have layouts for:
 *       • standard 0x2A37 (flags/BPM/R-R, via parse-hr),
 *       • WHOOP proprietary data char 61080004 (BPM bytes 1-2, R-R bytes 3-4).
 *
 * It returns a single JSON payload that gets written to `user_reports` so it can
 * be read back and analysed server-side. Physical device only — BLE is inert on
 * simulators. Channels that need a command handshake to start streaming (e.g. the
 * proprietary service) will show up as "present, notifiable, 0 packets" — that's
 * itself a useful signal.
 */
import { BleManager, State, type Device, type Subscription } from 'react-native-ble-plx';

import { base64ToBytes, parseHeartRate } from './parse-hr';

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_CHAR = '00002a37-0000-1000-8000-00805f9b34fb';
/** WHOOP 4.0 proprietary GATT (per open-source reverse engineering). */
const WHOOP_DATA_CHAR = '61080004-8d6d-82b8-614a-1c8cb0f8dcc6';

const SCAN_TIMEOUT_MS = 12_000;

export type DiagPayload = Record<string, unknown>;

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait for the adapter to report a definitive state (iOS reports Unknown first). */
function waitForBleState(manager: BleManager, timeoutMs = 6000): Promise<State> {
  return new Promise((resolve) => {
    let settled = false;
    let last = State.Unknown;
    const finish = (s: State) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.remove();
      resolve(s);
    };
    const timer = setTimeout(() => finish(last), timeoutMs);
    const sub = manager.onStateChange((s) => {
      last = s;
      if (s === State.PoweredOn || s === State.PoweredOff || s === State.Unauthorized || s === State.Unsupported)
        finish(s);
    }, true);
  });
}

/** Scan for a WHOOP (advertises the HR service in Broadcast mode). Name-hint optional. */
function scanForWhoop(manager: BleManager, timeoutMs: number): Promise<Device | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (d: Device | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      manager.stopDeviceScan();
      resolve(d);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    manager.startDeviceScan([HR_SERVICE], { allowDuplicates: false }, (error, device) => {
      if (error) return finish(null);
      if (device) finish(device);
    });
  });
}

/**
 * Run the diagnostic. `onStatus` drives the on-screen progress line.
 * Returns the payload regardless of outcome (errors are captured inside it).
 */
export async function runBleDiagnostic(opts: {
  durationMs?: number;
  onStatus?: (s: string) => void;
} = {}): Promise<DiagPayload> {
  const duration = opts.durationMs ?? 60_000;
  const log = opts.onStatus ?? (() => {});
  const manager = new BleManager();

  const notifications: Record<string, { t: number; hex: string }[]> = {};
  const hr180d: { t: number; bpm: number; rrPresent: boolean; rrMs: number[] }[] = [];
  const whoopProp: { t: number; bpm: number; rr: number; len: number }[] = [];
  const errors: string[] = [];
  const payload: DiagPayload = {
    startedAt: new Date().toISOString(),
    durationMs: duration,
    device: null,
    services: [] as string[],
    characteristics: [] as unknown[],
    notifications,
    decoded: { hr180d, whoopProp },
    errors,
  };

  const finish = (): DiagPayload => {
    payload.endedAt = new Date().toISOString();
    payload.counts = {
      services: (payload.services as string[]).length,
      characteristics: (payload.characteristics as unknown[]).length,
      notifyingChannels: Object.values(notifications).filter((a) => a.length > 0).length,
      hr180d_packets: hr180d.length,
      hr180d_packets_with_rr: hr180d.filter((x) => x.rrPresent && x.rrMs.length > 0).length,
      whoopProprietary_packets: whoopProp.length,
    };
    manager.destroy();
    return payload;
  };

  try {
    const state = await waitForBleState(manager);
    payload.bleState = String(state);
    if (state !== State.PoweredOn) {
      errors.push(`ble-not-powered:${state}`);
      return finish();
    }

    log('Scanning for your WHOOP…');
    const device = await scanForWhoop(manager, SCAN_TIMEOUT_MS);
    if (!device) {
      errors.push('not-found (is Broadcast Heart Rate on?)');
      return finish();
    }
    payload.device = { id: device.id, name: device.name ?? device.localName ?? null };

    log('Connecting…');
    const conn = await device.connect();
    await conn.discoverAllServicesAndCharacteristics();

    const services = await conn.services();
    const subs: Subscription[] = [];
    for (const svc of services) {
      (payload.services as string[]).push(svc.uuid);
      const chars = await svc.characteristics();
      for (const ch of chars) {
        (payload.characteristics as unknown[]).push({
          service: svc.uuid,
          uuid: ch.uuid,
          notifiable: ch.isNotifiable,
          indicatable: ch.isIndicatable,
          readable: ch.isReadable,
          writable: ch.isWritableWithResponse || ch.isWritableWithoutResponse,
        });

        if (ch.isNotifiable || ch.isIndicatable) {
          const key = ch.uuid.toLowerCase();
          notifications[key] = [];
          const sub = conn.monitorCharacteristicForService(svc.uuid, ch.uuid, (err, chr) => {
            if (err) {
              errors.push(`monitor:${key}:${err.message}`);
              return;
            }
            if (!chr?.value) return;
            const bytes = base64ToBytes(chr.value);
            const bucket = notifications[key];
            if (bucket.length < 80) bucket.push({ t: Date.now(), hex: toHex(bytes) });

            if (key === HR_MEASUREMENT_CHAR) {
              const p = parseHeartRate(bytes);
              hr180d.push({ t: Date.now(), bpm: p.bpm, rrPresent: p.rrPresent, rrMs: p.rrMs });
            } else if (key === WHOOP_DATA_CHAR && bytes.length >= 5) {
              whoopProp.push({
                t: Date.now(),
                bpm: bytes[1] | (bytes[2] << 8),
                rr: bytes[3] | (bytes[4] << 8),
                len: bytes.length,
              });
            }
          });
          subs.push(sub);
        }
      }
    }

    log(`Capturing ${Math.round(duration / 1000)}s — sit still & quiet…`);
    await delay(duration);

    subs.forEach((s) => s.remove());
    await conn.cancelConnection().catch(() => {});
  } catch (e) {
    errors.push(`exception:${e instanceof Error ? e.message : String(e)}`);
  }

  return finish();
}
