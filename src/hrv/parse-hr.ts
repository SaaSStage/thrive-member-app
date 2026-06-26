/**
 * Parser for the standard BLE Heart Rate Measurement characteristic (0x2A37).
 *
 * In production the value arrives base64-encoded from react-native-ble-plx; this
 * module operates on raw bytes so it stays pure and unit-testable. The wire layout
 * (Bluetooth SIG, little-endian) is:
 *
 *   byte 0      flags
 *     bit0      HR format: 0 = uint8 HR at byte 1; 1 = uint16 LE HR at bytes 1-2
 *     bit3      Energy Expended present: a uint16 LE follows the HR field
 *     bit4      R-R Interval present: zero or more uint16 LE values follow
 *   byte 1..    HR value (1 or 2 bytes per bit0)
 *   [2 bytes]   Energy Expended, only if bit3 set
 *   [2*n bytes] R-R intervals in units of 1/1024 s, only if bit4 set
 *
 * Parsing is defensive: a truncated packet stops cleanly and returns whatever was
 * read so far. This function never throws on malformed input.
 */

const RR_UNIT_HZ = 1024;

export type HeartRateMeasurement = {
  bpm: number;
  rrMs: number[];
  rrPresent: boolean;
};

export function parseHeartRate(bytes: Uint8Array | number[]): HeartRateMeasurement {
  const data = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);

  const flags = data.length > 0 ? data[0] : 0;
  const hr16 = (flags & 0x01) !== 0;
  const energyPresent = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;

  let offset = 1;
  let bpm = 0;

  if (hr16) {
    if (offset + 1 < data.length) {
      bpm = data[offset] | (data[offset + 1] << 8);
      offset += 2;
    } else {
      // Truncated HR field: nothing more to read.
      return { bpm, rrMs: [], rrPresent };
    }
  } else {
    if (offset < data.length) {
      bpm = data[offset];
      offset += 1;
    } else {
      return { bpm, rrMs: [], rrPresent };
    }
  }

  if (energyPresent) {
    // Skip the 2-byte Energy Expended field before any R-R values.
    offset += 2;
  }

  if (!rrPresent) {
    return { bpm, rrMs: [], rrPresent };
  }

  const rrMs: number[] = [];
  while (offset + 1 < data.length) {
    const raw = data[offset] | (data[offset + 1] << 8);
    rrMs.push(Math.round((raw * 1000) / RR_UNIT_HZ));
    offset += 2;
  }

  return { bpm, rrMs, rrPresent };
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(b64: string): Uint8Array {
  const atob = (globalThis as { atob?: (s: string) => string }).atob;
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return decodeBase64(b64);
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const len = Math.floor((clean.length * 6) / 8);
  const out = new Uint8Array(len);

  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const value = BASE64_ALPHABET.indexOf(clean[i]);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }

  return out;
}
