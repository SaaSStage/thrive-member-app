/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';

export function useTheme() {
  // The app is dark-only for now (the wireframe is dark). Lock to the dark
  // palette regardless of the system/emulator setting so the aesthetic stays
  // consistent. When a light design exists, switch back to useColorScheme().
  return Colors.dark;
}
