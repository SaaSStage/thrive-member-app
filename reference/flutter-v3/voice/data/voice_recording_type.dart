/// The three recording types in a voice submission, in capture order, with
/// their per-type config. The `dbValue` strings match
/// voice_recordings.recording_type exactly (the analyze-voice pipeline keys
/// on these).
library;

enum VoiceRecordingType {
  sustainedVowel,
  readingPassage,
  diadochokinetic,
}

extension VoiceRecordingTypeConfig on VoiceRecordingType {
  /// voice_recordings.recording_type value.
  String get dbValue => switch (this) {
        VoiceRecordingType.sustainedVowel => 'sustained_vowel',
        VoiceRecordingType.readingPassage => 'reading_passage',
        VoiceRecordingType.diadochokinetic => 'diadochokinetic',
      };

  /// Short label shown on review rows.
  String get shortLabel => switch (this) {
        VoiceRecordingType.sustainedVowel => "Sustained 'ah'",
        VoiceRecordingType.readingPassage => 'Reading passage',
        VoiceRecordingType.diadochokinetic => "'pa-ta-ka'",
      };

  /// Screen title.
  String get title => switch (this) {
        VoiceRecordingType.sustainedVowel => "Say 'ah' for 30 seconds",
        VoiceRecordingType.readingPassage =>
          'Read the passage below at a natural pace',
        VoiceRecordingType.diadochokinetic =>
          "Say 'pa-ta-ka' as fast as you can for 10 seconds",
      };

  /// Instructional subtext.
  String get instruction => switch (this) {
        VoiceRecordingType.sustainedVowel =>
          'Take a comfortable breath, then sustain the sound naturally. '
              "It's OK to pause and breathe if needed.",
        VoiceRecordingType.readingPassage =>
          'Read at your natural conversational pace. Don’t rush.',
        VoiceRecordingType.diadochokinetic =>
          "Repeat the syllables 'pa-ta-ka, pa-ta-ka' as quickly and clearly "
              'as you can.',
      };

  /// Target capture duration. The recorder auto-stops here; the user can also
  /// stop early.
  Duration get targetDuration => switch (this) {
        VoiceRecordingType.sustainedVowel => const Duration(seconds: 30),
        VoiceRecordingType.readingPassage => const Duration(seconds: 35),
        VoiceRecordingType.diadochokinetic => const Duration(seconds: 10),
      };

  /// Minimum acceptable recording length for validation. Deliberately NOT
  /// "80% of target" for the reading passage — the passages take ~25-30s to
  /// read but the target has 35s of headroom, so a fast reader who stops at
  /// 25s is still valid. These are conservative floors to avoid false
  /// failures; they'll be retuned against real-user data (LOE risk #6).
  Duration get minValidDuration => switch (this) {
        VoiceRecordingType.sustainedVowel => const Duration(seconds: 20),
        VoiceRecordingType.readingPassage => const Duration(seconds: 15),
        VoiceRecordingType.diadochokinetic => const Duration(seconds: 6),
      };

  /// Whether a bundled "Hear example" audio clip exists for this type. (The
  /// reading passage has no example — the text is the prompt.)
  bool get hasAudioExample => switch (this) {
        VoiceRecordingType.sustainedVowel => true,
        VoiceRecordingType.readingPassage => false,
        VoiceRecordingType.diadochokinetic => true,
      };

  /// 1-based position for the "Recording N of 3" header.
  int get stepNumber => switch (this) {
        VoiceRecordingType.sustainedVowel => 1,
        VoiceRecordingType.readingPassage => 2,
        VoiceRecordingType.diadochokinetic => 3,
      };
}

/// Capture order.
const List<VoiceRecordingType> kRecordingOrder = [
  VoiceRecordingType.sustainedVowel,
  VoiceRecordingType.readingPassage,
  VoiceRecordingType.diadochokinetic,
];
