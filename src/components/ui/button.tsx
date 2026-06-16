/**
 * Themed button primitive. Variants map to the wireframe's button styles
 * (primary = pink, green = vitality, ghost = elevated surface, tint = soft
 * primary). Consumes semantic theme roles only — no hardcoded color.
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'green' | 'ghost' | 'tint';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();

  const bg: Record<Variant, string> = {
    primary: t.primary,
    green: t.vitality,
    ghost: t.surfaceElevated,
    tint: t.primarySoft,
  };
  const fg: Record<Variant, string> = {
    primary: t.onPrimary,
    green: t.onVitality,
    ghost: t.text,
    tint: t.primary,
  };

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg[variant], opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <Text style={[styles.label, { color: fg[variant] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 50,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
  },
});
