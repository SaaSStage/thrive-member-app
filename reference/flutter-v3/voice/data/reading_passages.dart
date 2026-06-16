/// Reading passages bundled with the app (chunk 6). Mirrors the
/// `reading_passages` table in the v3 DB exactly (passage_code is the join
/// key sent up with the submission so analyze-voice knows which text was
/// read). Bundled statically so the voice flow works offline; the codes must
/// stay in sync with the server rows.
library;

class ReadingPassage {
  const ReadingPassage({
    required this.code,
    required this.language,
    required this.title,
    required this.body,
  });

  /// Matches reading_passages.passage_code (e.g. "EN-01"). Sent with the
  /// submission as voice_recordings.passage_id.
  final String code;

  /// "en" or "es" — matches the user's preferred_language.
  final String language;

  final String title;
  final String body;
}

const List<ReadingPassage> kReadingPassages = [
  ReadingPassage(
    code: 'EN-01',
    language: 'en',
    title: 'Rainbow Passage',
    body:
        'When the sunlight strikes raindrops in the air, they act as a prism '
        'and form a rainbow. The rainbow is a division of white light into '
        'many beautiful colors. These take the shape of a long round arch, '
        'with its path high above, and its two ends apparently beyond the '
        'horizon. There is, according to legend, a boiling pot of gold at '
        'one end.',
  ),
  ReadingPassage(
    code: 'EN-02',
    language: 'en',
    title: 'Grandfather Passage',
    body:
        'You wished to know all about my grandfather. Well, he is nearly '
        'ninety-three years old, yet he still thinks as swiftly as ever. He '
        'dresses himself in an old black frock coat, usually several buttons '
        'missing. A long beard clings to his chin, giving those who observe '
        'him a pronounced feeling of the utmost respect.',
  ),
  ReadingPassage(
    code: 'ES-01',
    language: 'es',
    title: 'El Abuelo',
    body:
        'Quisieras saber todo acerca de mi abuelo. Pues, tiene casi noventa y '
        'tres años y, aún así, piensa con la misma rapidez de siempre. Se '
        'viste con un viejo abrigo negro, generalmente al que le faltan '
        'varios botones. Una larga barba cuelga de su mentón, dando a quienes '
        'le observan un profundo sentimiento del más alto respeto.',
  ),
  ReadingPassage(
    code: 'ES-02',
    language: 'es',
    title: 'El Arcoíris',
    body:
        'Cuando la luz del sol incide sobre las gotas de lluvia en el aire, '
        'estas actúan como un prisma y forman un arcoíris. El arcoíris es una '
        'división de la luz blanca en muchos hermosos colores. Estos toman la '
        'forma de un largo arco redondo, con su trayectoria alta sobre '
        'nosotros, y sus dos extremos aparentemente más allá del horizonte.',
  ),
];

/// Pick a random active passage for the given language, falling back to
/// English if no match (so the flow never dead-ends on an unexpected locale).
/// Randomizing per session keeps users from memorizing one passage and
/// changing their reading delivery over time.
ReadingPassage randomPassageForLanguage(String language, {int? seed}) {
  final pool = kReadingPassages.where((p) => p.language == language).toList();
  final chosen = pool.isNotEmpty
      ? pool
      : kReadingPassages.where((p) => p.language == 'en').toList();
  final idx = (seed ?? DateTime.now().microsecondsSinceEpoch) % chosen.length;
  return chosen[idx.abs()];
}
