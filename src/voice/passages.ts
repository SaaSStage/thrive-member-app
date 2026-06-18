/**
 * Reading passages bundled with the app. Mirrors the `reading_passages` table in
 * the shared v3 DB exactly — `code` is the join key sent up with the submission
 * (as `voice_recordings.passage_id`) so analyze-voice knows which text was read.
 * Bundled statically so the flow works offline; codes must stay in sync with the
 * server rows.
 *
 * Ported from the v3 Flutter app's `lib/voice/data/reading_passages.dart`.
 */

export type PassageLanguage = 'en' | 'es';

export type ReadingPassage = {
  /** Matches reading_passages.passage_code (e.g. "EN-01"). */
  code: string;
  language: PassageLanguage;
  title: string;
  body: string;
};

export const READING_PASSAGES: readonly ReadingPassage[] = [
  {
    code: 'EN-01',
    language: 'en',
    title: 'Rainbow Passage',
    body:
      'When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow. ' +
      'The rainbow is a division of white light into many beautiful colors. These take the shape ' +
      'of a long round arch, with its path high above, and its two ends apparently beyond the ' +
      'horizon. There is, according to legend, a boiling pot of gold at one end.',
  },
  {
    code: 'EN-02',
    language: 'en',
    title: 'Grandfather Passage',
    body:
      'You wished to know all about my grandfather. Well, he is nearly ninety-three years old, ' +
      'yet he still thinks as swiftly as ever. He dresses himself in an old black frock coat, ' +
      'usually several buttons missing. A long beard clings to his chin, giving those who observe ' +
      'him a pronounced feeling of the utmost respect.',
  },
  {
    code: 'ES-01',
    language: 'es',
    title: 'El Abuelo',
    body:
      'Quisieras saber todo acerca de mi abuelo. Pues, tiene casi noventa y tres años y, aún así, ' +
      'piensa con la misma rapidez de siempre. Se viste con un viejo abrigo negro, generalmente al ' +
      'que le faltan varios botones. Una larga barba cuelga de su mentón, dando a quienes le ' +
      'observan un profundo sentimiento del más alto respeto.',
  },
  {
    code: 'ES-02',
    language: 'es',
    title: 'El Arcoíris',
    body:
      'Cuando la luz del sol incide sobre las gotas de lluvia en el aire, estas actúan como un ' +
      'prisma y forman un arcoíris. El arcoíris es una división de la luz blanca en muchos hermosos ' +
      'colores. Estos toman la forma de un largo arco redondo, con su trayectoria alta sobre ' +
      'nosotros, y sus dos extremos aparentemente más allá del horizonte.',
  },
];

/**
 * Pick a random active passage for the given language, falling back to English
 * if no match (so the flow never dead-ends on an unexpected locale). Randomizing
 * per session keeps users from memorizing one passage and changing their reading
 * delivery over time. Pass `rand` for deterministic tests.
 */
export function randomPassageForLanguage(
  language: string,
  rand: () => number = Math.random,
): ReadingPassage {
  const pool = READING_PASSAGES.filter((p) => p.language === language);
  const chosen = pool.length > 0 ? pool : READING_PASSAGES.filter((p) => p.language === 'en');
  const idx = Math.floor(rand() * chosen.length) % chosen.length;
  return chosen[idx];
}
