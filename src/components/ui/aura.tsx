/**
 * Full-bleed aurora background: deep plum base with soft teal/violet/gold
 * radial glows. The dark canvas the whole app sits on. Pure SVG (no blur lib).
 */
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

export function Aura({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.fill, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="aura_base" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0d0a1b" />
            <Stop offset="0.55" stopColor="#0b0814" />
            <Stop offset="1" stopColor="#070510" />
          </LinearGradient>
          <RadialGradient id="aura_teal" cx="16%" cy="5%" r="60%">
            <Stop offset="0" stopColor="#5eead4" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#5eead4" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="aura_violet" cx="90%" cy="12%" r="62%">
            <Stop offset="0" stopColor="#a78bfa" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="aura_gold" cx="50%" cy="100%" r="75%">
            <Stop offset="0" stopColor="#f3cd8b" stopOpacity="0.14" />
            <Stop offset="1" stopColor="#f3cd8b" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#aura_base)" />
        <Rect width="100%" height="100%" fill="url(#aura_teal)" />
        <Rect width="100%" height="100%" fill="url(#aura_violet)" />
        <Rect width="100%" height="100%" fill="url(#aura_gold)" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
