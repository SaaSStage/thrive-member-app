// TEMP: react-native-track-player 4.1.2 is incompatible with RN 0.85's
// New-Architecture TurboModule interop — touching the module at startup throws
// "TurboModule system assumes returnType == void iff the method is synchronous"
// and crashes the app. Until the player library is upgraded/replaced, we do NOT
// import RNTP at startup; the Radio screen loads it lazily on tap. See the
// playback TODO in src/app/(tabs)/radio.tsx.
import 'expo-router/entry';
