/// Member-facing descriptions for the Vitality score and its four sub-scores,
/// shown in the score-card info-icon popovers ("this is what the score
/// represents").
///
/// Copy is bundled in-app intentionally — it is stable product wording, not
/// per-submission data. Source of truth for the sub-score paragraphs is the
/// "App tooltip copy" blocks in the portal doc
/// `ThriveRadioPortal/Context/thrive-radio-voice-analysis-categories.md`; keep
/// them in sync if that doc changes.
library;

class ScoreInfo {
  const ScoreInfo({required this.title, required this.description});

  final String title;
  final String description;
}

const ScoreInfo vitalityInfo = ScoreInfo(
  title: 'Vitality Score',
  description:
      'Your Vitality Score is the single headline number for how your voice '
      'is doing today. It is the weighted average of your four wellness '
      'sub-scores — Emotional Wellness, Cognitive Clarity, Physical Energy, '
      'and Voice Power — which each count equally.',
);

const ScoreInfo emotionalWellnessInfo = ScoreInfo(
  title: 'Emotional Wellness',
  description:
      'Emotional Wellness measures the mood, stress, and anxiety signals '
      'carried in your voice. A higher score means your voice sounds '
      'emotionally balanced and settled. This score can shift quickly with '
      'daily stress and improves with rest, mindfulness, and emotional '
      'support practices.',
);

const ScoreInfo cognitiveClarityInfo = ScoreInfo(
  title: 'Cognitive Clarity',
  description:
      'Cognitive Clarity measures the sharpness, fluency, and mental '
      'engagement reflected in your voice. A higher score means your speech '
      'sounds crisp and mentally present. This score responds to sleep, '
      'nutrition, mental engagement, and overall brain health practices.',
);

const ScoreInfo physicalEnergyInfo = ScoreInfo(
  title: 'Physical Energy',
  description:
      'Physical Energy measures the strength of your breath support, vocal '
      'projection, and overall energy carried in your voice. A higher score '
      'means you have strong breath behind your voice. This score improves '
      'with breathing practice, cardiovascular fitness, hydration, and rest.',
);

const ScoreInfo voicePowerInfo = ScoreInfo(
  title: 'Voice Power',
  description:
      'Voice Power measures the strength, clarity, and steadiness of your '
      'voice. A higher score means your voice projects with confidence and '
      'your vocal mechanisms are working well. Voice Power often declines '
      'with age, stress, or fatigue, and improves with breathing practice, '
      'hydration, and consistent vocal use.',
);
