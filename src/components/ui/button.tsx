/**
 * Themed button primitive.
 *   primary — spectral gradient pill (teal→indigo→violet), dark label
 *   green   — solid vitality fill
 *   ghost   — translucent glass
 *   tint    — soft primary
 * Consumes semantic theme roles only — no hardcoded color.
 */
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Gradients, Radius, Type } from '@/constants/theme';
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
  const isDisabled = disabled || loading;

  const fg: Record<Variant, string> = {
    primary: t.onPrimary,
    green: t.onVitality,
    ghost: t.text,
    tint: t.primary,
  };
  const solidBg: Record<Variant, string | undefined> = {
    primary: undefined, // gradient
    green: t.vitality,
    ghost: t.surfaceElevated,
    tint: t.primarySoft,
  };

  const content = loading ? (
    <ActivityIndicator color={fg[variant]} />
  ) : (
    <Text style={[styles.label, { color: fg[variant] }]}>{label}</Text>
  );

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [styles.wrap, { opacity: isDisabled ? 0.5 : pressed ? 0.9 : 1 }, style]}>
        <LinearGradient
          colors={Gradients.button as unknown as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}>
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'ghost' && { borderWidth: 1, borderColor: t.hairline },
        { backgroundColor: solidBg[variant], opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: Radius.xl, overflow: 'hidden' },
  btn: {
    height: 54,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  label: { ...Type.bodyStrong, fontSize: 16 },
});
