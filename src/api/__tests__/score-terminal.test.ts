import { isTerminalStatus, type NarrativeStatus, type SubmissionStatus } from '../score';

/**
 * The terminal test is the single most important rule in the voice-result
 * contract: poll on `status` alone and a new member's submission (which ends at
 * analyzed + baseline_pending) polls forever and looks broken. These cases pin
 * the exact contract:
 *   terminal = status in {reported, failed, narrative_failed}
 *              OR (status == 'analyzed' AND narrative_status != 'pending')
 */
describe('isTerminalStatus', () => {
  const cases: { status: SubmissionStatus; narrative: NarrativeStatus | null; terminal: boolean; why: string }[] = [
    // In-flight happy-path stages — always keep polling. narrative_status is null
    // here because no analysis_results row exists yet.
    { status: 'pending', narrative: null, terminal: false, why: 'received, waiting' },
    { status: 'queued', narrative: null, terminal: false, why: 'queued' },
    { status: 'extracting', narrative: null, terminal: false, why: 'analyzing audio (longest)' },
    { status: 'scoring', narrative: null, terminal: false, why: 'computing results' },
    { status: 'narrating', narrative: 'pending', terminal: false, why: 'writing the summary' },

    // The ambiguous one: `analyzed` is only terminal once narrative_status moves
    // past 'pending'.
    { status: 'analyzed', narrative: 'pending', terminal: false, why: 'summary still generating → narrating next' },
    { status: 'analyzed', narrative: 'baseline_pending', terminal: true, why: 'no baseline → locked, terminal' },
    { status: 'analyzed', narrative: 'generated', terminal: true, why: 'scores + summary ready' },
    { status: 'analyzed', narrative: 'narrative_failed', terminal: true, why: 'scores ready, summary failed' },
    // Race guard: status flipped to analyzed before narrative_status was written.
    // A null here must NOT be read as terminal, or we'd terminate early.
    { status: 'analyzed', narrative: null, terminal: false, why: 'transient race → keep polling' },

    // Unconditional terminal states.
    { status: 'reported', narrative: 'generated', terminal: true, why: 'fully done' },
    { status: 'failed', narrative: null, terminal: true, why: 'error' },
    { status: 'narrative_failed', narrative: 'narrative_failed', terminal: true, why: 'scores ready, summary failed' },
  ];

  it.each(cases)('$status / $narrative → terminal=$terminal ($why)', ({ status, narrative, terminal }) => {
    expect(isTerminalStatus(status, narrative)).toBe(terminal);
  });
});
