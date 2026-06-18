/**
 * Reusable profile form controls, shared by the Profile Setup wizard and the
 * Settings → Profile edit screen. Plain themed pressables (no native picker
 * dependency). MultiSelect handles the "none is mutually exclusive" rule.
 */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Option<T extends string> = { value: T; label: string };

export function FieldLabel({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.textSecondary }]}>{children}</Text>;
}

export function SingleSelect<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.options}>
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              style={[
                styles.chip,
                { backgroundColor: selected ? t.primary : t.surface, borderColor: selected ? t.primary : t.hairline },
              ]}>
              <Text style={[styles.chipText, { color: selected ? t.onPrimary : t.text }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function MultiSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  noneValue = 'none' as T,
}: {
  label: string;
  options: Option<T>[];
  value: T[];
  onChange: (v: T[]) => void;
  noneValue?: T;
}) {
  const t = useTheme();
  function toggle(v: T) {
    if (v === noneValue) {
      onChange([noneValue]);
      return;
    }
    const without = value.filter((x) => x !== noneValue);
    onChange(without.includes(v) ? without.filter((x) => x !== v) : [...without, v]);
  }
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.options}>
        {options.map((o) => {
          const selected = value.includes(o.value);
          return (
            <Pressable
              key={o.value}
              onPress={() => toggle(o.value)}
              style={[
                styles.chip,
                { backgroundColor: selected ? t.primary : t.surface, borderColor: selected ? t.primary : t.hairline },
              ]}>
              <Text style={[styles.chipText, { color: selected ? t.onPrimary : t.text }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function YearField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <FieldLabel>Year of birth</FieldLabel>
      <TextInput
        keyboardType="number-pad"
        maxLength={4}
        value={value != null ? String(value) : ''}
        onChangeText={(text) => {
          const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
          onChange(digits.length === 4 ? Number(digits) : null);
        }}
        placeholder="YYYY"
        placeholderTextColor={t.textTertiary}
        style={[styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.hairline }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 24 },
  label: { ...Type.bodyStrong, marginBottom: 10 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  chipText: { ...Type.callout, fontWeight: '600' },
  input: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    width: 140,
  },
});
