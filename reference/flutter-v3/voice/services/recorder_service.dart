/// Thin wrapper around the `record` package's [AudioRecorder].
///
/// Chunk 5 scope (foundation):
/// - Records WAV at 44.1 kHz / 16-bit / mono — the spec the analyze-voice
///   edge function expects from `voice_recordings` rows.
/// - Provides start/stop/isRecording primitives plus a stream of amplitude
///   readings so the upcoming Screens A–G (chunk 6) can show a waveform or
///   pulse indicator without re-implementing the polling loop.
/// - Coexistence with the live-radio iOS native AVPlayer is the
///   responsibility of higher layers (callers must pause the live player
///   before invoking [start]; see [[v3-execution-plan]] chunk 5b notes).
library;

import 'dart:async';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// The audio format the analyze-voice pipeline expects for all three
/// recordings in a voice_submission.
const RecordConfig voiceCaptureConfig = RecordConfig(
  encoder: AudioEncoder.wav,
  sampleRate: 44100,
  numChannels: 1,
  // bitRate is ignored for WAV (which is uncompressed PCM); set anyway so
  // the field is non-default when the encoder is later swapped for, say,
  // AAC for upload-side compression experiments.
  bitRate: 256000,
  autoGain: false,
  echoCancel: false,
  noiseSuppress: false,
);

class RecorderService {
  RecorderService();

  final AudioRecorder _recorder = AudioRecorder();

  /// True after [start] succeeds and before [stop] is called.
  Future<bool> get isRecording => _recorder.isRecording();

  /// Whether the OS has granted microphone permission, asking the user if
  /// it hasn't been answered yet. Returns false on permanent denial.
  Future<bool> ensurePermission() => _recorder.hasPermission();

  /// A periodic amplitude stream (current + max in dBFS) for waveform UI.
  /// Polls every [interval]; the stream closes when recording stops.
  Stream<Amplitude> onAmplitudeChanged({
    Duration interval = const Duration(milliseconds: 100),
  }) {
    return _recorder.onAmplitudeChanged(interval);
  }

  /// Start a new WAV recording.
  ///
  /// Returns the absolute file path the recording will be written to. The
  /// file is finalized only after [stop] returns; do NOT read or upload it
  /// before that.
  ///
  /// [namePrefix] becomes part of the filename — useful when capturing
  /// multiple recordings per voice_submission ("sustained_vowel",
  /// "reading_passage", "diadochokinetic").
  Future<String> start({String namePrefix = 'recording'}) async {
    if (!await ensurePermission()) {
      throw const RecorderPermissionDeniedException();
    }
    final dir = await getApplicationDocumentsDirectory();
    final ts = DateTime.now().millisecondsSinceEpoch;
    final path = '${dir.path}/${namePrefix}_$ts.wav';
    await _recorder.start(voiceCaptureConfig, path: path);
    return path;
  }

  /// Stop recording. Returns the absolute path of the finalized WAV file,
  /// or `null` if no recording was in progress.
  Future<String?> stop() => _recorder.stop();

  /// Cancel an in-progress recording and delete the partial file.
  Future<void> cancel() => _recorder.cancel();

  /// Release native resources. Call when the voice flow is fully torn down.
  Future<void> dispose() => _recorder.dispose();

  // ---- WAV header inspection ----------------------------------------------
  // Lightweight helper used by chunk 5 verification + the mic-test screen.
  // Walks the RIFF chunk list to find 'fmt ' and 'data'; returns null if the
  // file doesn't look like a PCM WAV.

  /// Decode the WAV header to confirm sample rate / channels / bit depth /
  /// data size. Returns null on any parse failure.
  ///
  /// Walks the RIFF chunks rather than assuming the canonical 44-byte layout:
  /// iOS (CoreAudio) inserts extra chunks (e.g. a 'FLLR' filler or 'fact')
  /// before the 'data' chunk, so 'data' is not at offset 36 and the audio is
  /// not at byte 44. Reads the whole file (recordings are <3 MB).
  static Future<WavHeader?> readWavHeader(String path) async {
    final file = File(path);
    if (!await file.exists()) return null;
    final bytes = await file.readAsBytes();
    if (bytes.length < 12) return null;
    if (String.fromCharCodes(bytes.sublist(0, 4)) != 'RIFF') return null;
    if (String.fromCharCodes(bytes.sublist(8, 12)) != 'WAVE') return null;

    int u16(int o) => bytes[o] | (bytes[o + 1] << 8);
    int u32(int o) =>
        bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24);
    String tag(int o) => String.fromCharCodes(bytes.sublist(o, o + 4));

    int audioFormat = 0, numChannels = 1, sampleRate = 0, bitsPerSample = 0;
    int? dataSize;
    var foundFmt = false, foundData = false;

    // Chunks start after 'WAVE' (offset 12). Each: 4-char id + uint32 size +
    // body, word-aligned (odd sizes get a trailing pad byte).
    var offset = 12;
    while (offset + 8 <= bytes.length) {
      final id = tag(offset);
      final size = u32(offset + 4);
      final body = offset + 8;
      if (id == 'fmt ' && body + 16 <= bytes.length) {
        audioFormat = u16(body); // 1 = PCM
        numChannels = u16(body + 2);
        sampleRate = u32(body + 4);
        bitsPerSample = u16(body + 14);
        foundFmt = true;
      } else if (id == 'data') {
        final available = bytes.length - body;
        dataSize = (size <= 0 || size > available) ? available : size;
        foundData = true;
        break;
      }
      offset = body + size + (size.isOdd ? 1 : 0);
    }
    if (!foundFmt || !foundData) return null;

    return WavHeader(
      audioFormat: audioFormat,
      numChannels: numChannels,
      sampleRate: sampleRate,
      bitsPerSample: bitsPerSample,
      dataSizeBytes: dataSize ?? 0,
    );
  }
}

class WavHeader {
  const WavHeader({
    required this.audioFormat,
    required this.numChannels,
    required this.sampleRate,
    required this.bitsPerSample,
    required this.dataSizeBytes,
  });

  /// 1 = uncompressed PCM. Anything else is not what we want.
  final int audioFormat;
  final int numChannels;
  final int sampleRate;
  final int bitsPerSample;
  final int dataSizeBytes;

  bool get isPcm => audioFormat == 1;
  bool get isMono => numChannels == 1;
  bool get is16Bit => bitsPerSample == 16;
  bool get is44k => sampleRate == 44100;

  /// True when the recording matches the analyze-voice spec exactly.
  bool get matchesVoiceCaptureSpec => isPcm && isMono && is16Bit && is44k;

  /// Duration computed from the data chunk size + format. Useful for
  /// sanity-checking the recording length without decoding samples.
  Duration get duration {
    if (!isPcm || numChannels == 0 || sampleRate == 0 || bitsPerSample == 0) {
      return Duration.zero;
    }
    final bytesPerSecond = sampleRate * numChannels * (bitsPerSample ~/ 8);
    if (bytesPerSecond == 0) return Duration.zero;
    final seconds = dataSizeBytes / bytesPerSecond;
    return Duration(milliseconds: (seconds * 1000).round());
  }

  @override
  String toString() =>
      'WavHeader(format: $audioFormat, channels: $numChannels, '
      'sampleRate: $sampleRate, bits: $bitsPerSample, '
      'dataBytes: $dataSizeBytes, duration: ${duration.inMilliseconds}ms, '
      'matchesSpec: $matchesVoiceCaptureSpec)';
}

class RecorderPermissionDeniedException implements Exception {
  const RecorderPermissionDeniedException();

  @override
  String toString() =>
      'RecorderPermissionDeniedException: microphone permission was denied. '
      'Ask the user to grant access in Settings.';
}
