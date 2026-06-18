/**
 * Voice-analysis profile fields (clinical/demographic) on public.users. Read +
 * update via the Clerk-bound Supabase client; RLS scopes to the member's own row
 * (we resolve the id via current_user_id to be explicit). Option sets mirror the
 * server-side CHECK constraints exactly (migration 0007) — only these values are
 * accepted.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSupabase } from '@/api/supabase';

export type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say';
export type SmokingStatus = 'never' | 'former' | 'current';
export type RespiratoryCondition = 'none' | 'asthma' | 'copd' | 'chronic_bronchitis' | 'sleep_apnea' | 'other';
export type VocalCondition = 'none' | 'vocal_fold_disorder' | 'chronic_laryngitis' | 'voice_overuse_injury' | 'other';
export type PreferredLanguage = 'en' | 'es';

export type VoiceProfile = {
  year_of_birth: number | null;
  biological_sex: BiologicalSex | null;
  smoking_status: SmokingStatus | null;
  respiratory_conditions: RespiratoryCondition[];
  vocal_conditions: VocalCondition[];
  preferred_language: PreferredLanguage;
};

const COLUMNS =
  'year_of_birth, biological_sex, smoking_status, respiratory_conditions, vocal_conditions, preferred_language';

/** Option sets + labels for the UI (values match the DB CHECK constraints). */
export const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];
export const SMOKING_OPTIONS: { value: SmokingStatus; label: string }[] = [
  { value: 'never', label: 'Never smoked' },
  { value: 'former', label: 'Former smoker' },
  { value: 'current', label: 'Current smoker' },
];
export const RESPIRATORY_OPTIONS: { value: RespiratoryCondition; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'asthma', label: 'Asthma' },
  { value: 'copd', label: 'COPD' },
  { value: 'chronic_bronchitis', label: 'Chronic bronchitis' },
  { value: 'sleep_apnea', label: 'Sleep apnea' },
  { value: 'other', label: 'Other' },
];
export const VOCAL_OPTIONS: { value: VocalCondition; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'vocal_fold_disorder', label: 'Vocal fold disorder' },
  { value: 'chronic_laryngitis', label: 'Chronic laryngitis' },
  { value: 'voice_overuse_injury', label: 'Voice overuse injury' },
  { value: 'other', label: 'Other' },
];
export const LANGUAGE_OPTIONS: { value: PreferredLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];

/** All required voice-analysis fields present (none-arrays count as answered). */
export function isProfileComplete(p: VoiceProfile | null | undefined): boolean {
  if (!p) return false;
  return (
    p.year_of_birth != null &&
    p.biological_sex != null &&
    p.smoking_status != null &&
    p.preferred_language != null &&
    Array.isArray(p.respiratory_conditions) &&
    p.respiratory_conditions.length > 0 &&
    Array.isArray(p.vocal_conditions) &&
    p.vocal_conditions.length > 0
  );
}

export function useVoiceProfile() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['voice-profile'],
    queryFn: async (): Promise<VoiceProfile> => {
      const { data: id, error: idErr } = await supabase.rpc('current_user_id');
      if (idErr || !id) throw idErr ?? new Error('Not signed in.');
      const { data, error } = await supabase.from('users').select(COLUMNS).eq('id', id).single();
      if (error) throw error;
      return {
        year_of_birth: data.year_of_birth ?? null,
        biological_sex: data.biological_sex ?? null,
        smoking_status: data.smoking_status ?? null,
        respiratory_conditions: data.respiratory_conditions ?? [],
        vocal_conditions: data.vocal_conditions ?? [],
        preferred_language: (data.preferred_language ?? 'en') as PreferredLanguage,
      };
    },
  });
}

export function useUpdateVoiceProfile() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<VoiceProfile>) => {
      const { data: id, error: idErr } = await supabase.rpc('current_user_id');
      if (idErr || !id) throw idErr ?? new Error('Not signed in.');
      const { error } = await supabase.from('users').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice-profile'] }),
  });
}
