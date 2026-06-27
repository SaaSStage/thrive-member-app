/**
 * BLE transport for live HRV: connects to a WHOOP (or any sensor advertising the
 * standard Bluetooth Heart Rate Service) and streams beat-to-beat R-R intervals.
 *
 * This is the single seam over `react-native-ble-plx` — everything above it
 * (the RMSSD window, the store, the UI) is transport-agnostic, so swapping to a
 * custom native module later would only touch this file. The byte parsing lives
 * in ./parse-hr (pure + unit-tested); this module only does connection lifecycle.
 *
 * NOTE: requires a physical device — BLE does not work on emulators/simulators.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State, type Device, type Subscription } from 'react-native-ble-plx';

import { base64ToBytes, parseHeartRate } from './parse-hr';

/** Heart Rate Service (0x180D) and Heart Rate Measurement characteristic (0x2A37). */
const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_CHAR = '00002a37-0000-1000-8000-00805f9b34fb';

const DEFAULT_SCAN_TIMEOUT_MS = 12_000;
/**
 * A real WHOOP only begins emitting R-R intervals ~30 s after Broadcast starts
 * (it withholds them while the optical signal stabilises — measured at t+31.9 s on
 * hardware). Only after this window with still no R-R do we treat it as failed.
 */
const NO_RR_TIMEOUT_MS = 50_000;

export type BleHrStatus = 'scanning' | 'connecting' | 'tracking' | 'no-rr';
export type BleHrErrorCode =
  | 'bluetooth-off'
  | 'permission-denied'
  | 'not-found'
  | 'connect-failed'
  | 'unknown';

export type BleHrSample = { bpm: number; rrMs: number[] };

export type BleHrCallbacks = {
  onStatus?: (status: BleHrStatus) => void;
  onSample?: (sample: BleHrSample) => void;
  onError?: (code: BleHrErrorCode, message?: string) => void;
};

export type BleHrStartOptions = {
  /** Only match sensors whose advertised name includes this (case-insensitive), e.g. "WHOOP". */
  deviceNameHint?: string;
  scanTimeoutMs?: number;
};

/** Request the runtime Bluetooth permissions Android needs before scanning. */
async function ensureAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  // API 31+ uses the new neverForLocation Bluetooth permissions; older needs FINE_LOCATION.
  if (typeof Platform.Version === 'number' && Platform.Version >= 31) {
    const res = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  }
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Resolve once the Bluetooth adapter reports a *definitive* state.
 *
 * On iOS a freshly-created `BleManager` reports `State.Unknown` for the first few
 * hundred ms while CoreBluetooth spins up (and again while the permission prompt is
 * open). Reading `manager.state()` synchronously then wrongly looks like "Bluetooth
 * off". Instead we subscribe with `emitCurrentState = true` and wait for a real
 * state — PoweredOn / PoweredOff / Unauthorized / Unsupported — ignoring the
 * transient Unknown/Resetting. Falls back to the last state seen on timeout.
 */
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
      if (
        s === State.PoweredOn ||
        s === State.PoweredOff ||
        s === State.Unauthorized ||
        s === State.Unsupported
      ) {
        finish(s);
      }
    }, true);
  });
}

/**
 * Drives one live-HRV connection. Create per session, call `start()`, and always
 * `stop()` when finished or on unmount — it cancels the subscription, disconnects,
 * and destroys the manager so the radio/connection never leaks.
 */
export class BleHrClient {
  private manager: BleManager | null = null;
  private device: Device | null = null;
  private monitor: Subscription | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private noRrTimer: ReturnType<typeof setTimeout> | null = null;
  private sawRr = false;
  private stopped = false;

  constructor(private readonly cb: BleHrCallbacks) {}

  async start(opts: BleHrStartOptions = {}): Promise<void> {
    this.stopped = false;
    this.sawRr = false;

    const granted = await ensureAndroidPermissions();
    if (this.stopped) return;
    if (!granted) {
      this.cb.onError?.('permission-denied');
      return;
    }

    this.manager ??= new BleManager();
    const manager = this.manager;

    // Wait for the adapter to settle — iOS reports `Unknown` on the first tick even
    // when Bluetooth is on, so a synchronous state read false-positives as "off".
    const state = await waitForBleState(manager);
    if (this.stopped) return;
    if (state === State.Unauthorized) {
      this.cb.onError?.('permission-denied');
      return;
    }
    if (state !== State.PoweredOn) {
      this.cb.onError?.('bluetooth-off');
      return;
    }

    this.cb.onStatus?.('scanning');
    const hint = opts.deviceNameHint?.toLowerCase();

    this.scanTimer = setTimeout(() => {
      manager.stopDeviceScan();
      if (!this.stopped) this.cb.onError?.('not-found');
    }, opts.scanTimeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS);

    manager.startDeviceScan([HR_SERVICE], { allowDuplicates: false }, (error, device) => {
      if (this.stopped) return;
      if (error) {
        this.clearScanTimer();
        this.cb.onError?.('unknown', error.message);
        return;
      }
      if (!device) return;
      // Match a name hint (e.g. "WHOOP") if given, else any sensor advertising HR.
      const name = (device.name ?? device.localName ?? '').toLowerCase();
      const matches = hint ? name.includes(hint) : true;
      if (!matches) return;
      this.clearScanTimer();
      manager.stopDeviceScan();
      void this.connect(device);
    });
  }

  private async connect(device: Device): Promise<void> {
    try {
      this.cb.onStatus?.('connecting');
      const connected = await device.connect();
      if (this.stopped) {
        await connected.cancelConnection().catch(() => {});
        return;
      }
      this.device = connected;
      // Surface a mid-session drop instead of silently waiting out the R-R timeout.
      connected.onDisconnected((err) => {
        if (!this.stopped) this.cb.onError?.('connect-failed', `disconnected${err ? ': ' + err.message : ''}`);
      });
      await connected.discoverAllServicesAndCharacteristics();
      if (this.stopped) return;

      this.monitor = connected.monitorCharacteristicForService(
        HR_SERVICE,
        HR_MEASUREMENT_CHAR,
        (error, ch) => {
          if (this.stopped) return;
          if (error) {
            this.cb.onError?.('connect-failed', error.message);
            return;
          }
          if (!ch?.value) return;
          const { bpm, rrMs, rrPresent } = parseHeartRate(base64ToBytes(ch.value));
          if (rrPresent && rrMs.length > 0) {
            this.sawRr = true;
            this.clearNoRrTimer();
          }
          this.cb.onSample?.({ bpm, rrMs });
        },
      );

      this.cb.onStatus?.('tracking');
      // If the band connects but never sends R-R, Broadcast mode is off.
      this.noRrTimer = setTimeout(() => {
        if (!this.stopped && !this.sawRr) this.cb.onStatus?.('no-rr');
      }, NO_RR_TIMEOUT_MS);
    } catch (e) {
      if (!this.stopped) {
        this.cb.onError?.('connect-failed', e instanceof Error ? e.message : undefined);
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearScanTimer();
    this.clearNoRrTimer();
    this.monitor?.remove();
    this.monitor = null;
    this.manager?.stopDeviceScan();
    if (this.device) {
      await this.device.cancelConnection().catch(() => {});
      this.device = null;
    }
    this.manager?.destroy();
    this.manager = null;
  }

  private clearScanTimer(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  private clearNoRrTimer(): void {
    if (this.noRrTimer) {
      clearTimeout(this.noRrTimer);
      this.noRrTimer = null;
    }
  }
}
