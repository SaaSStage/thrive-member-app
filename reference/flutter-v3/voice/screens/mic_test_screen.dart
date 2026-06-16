/// Temporary mic-test screen for chunk 5 voice-recording-foundation
/// verification. Exercises [RecorderService] end-to-end: requests
/// permission, records, stops, parses the WAV header, reports whether the
/// captured file matches the analyze-voice spec (44.1 kHz / 16-bit / mono).
///
/// Will be removed/replaced by the real Screens A–G voice flow in chunk 6.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import 'package:radio_online/voice/services/recorder_service.dart';

class MicTestScreen extends StatefulWidget {
  const MicTestScreen({super.key});

  @override
  State<MicTestScreen> createState() => _MicTestScreenState();
}

class _MicTestScreenState extends State<MicTestScreen> {
  final _recorder = RecorderService();

  bool _isRecording = false;
  String? _statusMessage;
  Color _statusColor = Colors.grey;
  String? _currentPath;
  String? _finalPath;
  Duration _elapsed = Duration.zero;
  Timer? _elapsedTimer;
  WavHeader? _lastHeader;

  @override
  void dispose() {
    _elapsedTimer?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() {
      _statusMessage = null;
      _lastHeader = null;
      _finalPath = null;
    });
    try {
      final path = await _recorder.start(namePrefix: 'mic_test');
      if (!mounted) return;
      setState(() {
        _isRecording = true;
        _currentPath = path;
        _elapsed = Duration.zero;
      });
      _elapsedTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
        if (mounted) setState(() => _elapsed += const Duration(milliseconds: 100));
      });
    } on RecorderPermissionDeniedException {
      _setStatus('Microphone permission denied.', Colors.red);
    } catch (e) {
      _setStatus('Failed to start: $e', Colors.red);
    }
  }

  Future<void> _stop() async {
    _elapsedTimer?.cancel();
    _elapsedTimer = null;
    try {
      final path = await _recorder.stop();
      if (!mounted) return;
      setState(() {
        _isRecording = false;
        _finalPath = path;
      });
      if (path == null) {
        _setStatus('Recorder returned no path.', Colors.orange);
        return;
      }
      final header = await RecorderService.readWavHeader(path);
      if (!mounted) return;
      setState(() => _lastHeader = header);
      if (header == null) {
        _setStatus('Could not parse WAV header.', Colors.red);
      } else if (header.matchesVoiceCaptureSpec) {
        _setStatus(
          '✓ Spec match: PCM ${header.sampleRate} Hz, '
          '${header.bitsPerSample}-bit, '
          '${header.numChannels} channel — '
          '${header.duration.inMilliseconds} ms recorded',
          Colors.green,
        );
      } else {
        _setStatus(
          '⚠ Spec mismatch: PCM=${header.isPcm} '
          'rate=${header.sampleRate} bits=${header.bitsPerSample} '
          'channels=${header.numChannels}',
          Colors.orange,
        );
      }
    } catch (e) {
      _setStatus('Failed to stop: $e', Colors.red);
    }
  }

  void _setStatus(String msg, Color color) {
    if (!mounted) return;
    setState(() {
      _statusMessage = msg;
      _statusColor = color;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mmss =
        '${_elapsed.inMinutes.toString().padLeft(2, '0')}:'
        '${(_elapsed.inSeconds % 60).toString().padLeft(2, '0')}';
    final ms = (_elapsed.inMilliseconds % 1000).toString().padLeft(3, '0');

    return Scaffold(
      appBar: AppBar(title: const Text('Mic Test')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _isRecording ? 'Recording…' : 'Idle',
                style: theme.textTheme.titleLarge?.copyWith(
                  color: _isRecording ? theme.primaryColor : null,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                '$mmss.$ms',
                style: theme.textTheme.displayMedium?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              ElevatedButton.icon(
                onPressed: _isRecording ? _stop : _start,
                icon: Icon(_isRecording ? Icons.stop : Icons.mic),
                label: Text(_isRecording ? 'Stop' : 'Start recording'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  backgroundColor:
                      _isRecording ? Colors.red : theme.primaryColor,
                  foregroundColor: Colors.white,
                ),
              ),
              const SizedBox(height: 24),
              if (_statusMessage != null)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: _statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _statusColor.withValues(alpha: 0.6)),
                  ),
                  child: Text(
                    _statusMessage!,
                    style: TextStyle(color: _statusColor),
                  ),
                ),
              const SizedBox(height: 24),
              if (_lastHeader != null) ...[
                Text('WAV header', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                _kv('audio_format', '${_lastHeader!.audioFormat} (PCM=1)'),
                _kv('sample_rate', '${_lastHeader!.sampleRate} Hz'),
                _kv('num_channels', '${_lastHeader!.numChannels}'),
                _kv('bits_per_sample', '${_lastHeader!.bitsPerSample}'),
                _kv('data_bytes', '${_lastHeader!.dataSizeBytes}'),
                _kv('duration', '${_lastHeader!.duration.inMilliseconds} ms'),
              ],
              const SizedBox(height: 16),
              if (_finalPath != null)
                SelectableText(
                  'File: $_finalPath',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                  ),
                )
              else if (_currentPath != null && _isRecording)
                Text(
                  'Writing: $_currentPath',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _kv(String key, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(
            width: 140,
            child: Text(
              key,
              style: TextStyle(
                color: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.color
                    ?.withValues(alpha: 0.6),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
            ),
          ),
        ],
      ),
    );
  }
}
