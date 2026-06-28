import { useRouter, type Href } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Aura } from '@/components/ui/aura';
import { Button } from '@/components/ui/button';
import { Mandala } from '@/components/ui/mandala';
import { YGlyph } from '@/components/ui/y-glyph';
import { Gradients, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const LOGO = require('../../../assets/images/logo-cut2.png');

export default function Welcome() {
  const t = useTheme();
  const router = useRouter();

  return (
    <Aura>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          {/* Breathing gold mandala sits BEHIND the lockup; the brand text below
              renders after it, so the mandala never covers the text. */}
          <View style={styles.emblem}>
            <View style={styles.mandalaWrap} pointerEvents="none">
              <Mandala
                size={300}
                colors={Gradients.gold as unknown as string[]}
                motion="breathe"
                opacity={0.62}
                glow={0.7}
                breatheMs={4500}
                breatheRange={0.26}
                dynamicBlur
              />
            </View>
            {/* Y · [logo] · Y  →  YOY "You Only Younger" */}
            <View style={styles.lockup}>
              <YGlyph h={108} />
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />
              <YGlyph h={108} />
            </View>
          </View>
          <Text style={[styles.brand, { color: t.text }]}>Thrive Radio</Text>
          <Text style={[styles.tagline, { color: t.textSecondary }]}>
            You Only Younger — healing frequencies, attuned to you.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button label="Tune in" onPress={() => router.push('/(auth)/sign-in' as Href)} />
        </View>
      </SafeAreaView>
    </Aura>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 30, justifyContent: 'space-between', paddingVertical: 56 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emblem: { width: 320, height: 200, alignItems: 'center', justifyContent: 'center' },
  mandalaWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 168, height: 168, marginHorizontal: -12, tintColor: '#d9d4cf' },
  brand: { ...Type.largeTitle, fontSize: 34, marginTop: 20 },
  tagline: { ...Type.body, fontSize: 15, textAlign: 'center', maxWidth: 250, marginTop: 8 },
  actions: { gap: 16 },
  fine: { ...Type.subhead, textAlign: 'center' },
});
