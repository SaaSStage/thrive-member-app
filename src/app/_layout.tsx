import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Sora_300Light,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  useFonts,
} from '@expo-google-fonts/sora';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SupabaseProvider } from '@/api/supabase';
import { Colors } from '@/constants/theme';
import { LiveHrvProvider } from '@/hrv/live-hrv-provider';
import { useWearableStore } from '@/stores/wearable-store';
import { WhoopSyncProvider } from '@/whoop/WhoopSyncProvider';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in .env.local');
}

const queryClient = new QueryClient();

function Splash() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.dark.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ActivityIndicator color={Colors.dark.primary} />
    </View>
  );
}

/** Routes the app between the (auth) and (tabs) groups based on Clerk state. */
function RootNavigator() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Sora_300Light,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (isSignedIn && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (!isSignedIn && segments[0] != null && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    }
  }, [isLoaded, isSignedIn, segments, router]);

  useEffect(() => {
    void useWearableStore.getState().hydrate();
  }, []);

  if (!isLoaded || !fontsLoaded) return <Splash />;

  return (
    <LiveHrvProvider>
      {isSignedIn ? <WhoopSyncProvider /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="player" options={{ presentation: 'modal' }} />
        <Stack.Screen name="voice" options={{ presentation: 'modal' }} />
        <Stack.Screen name="score" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile-setup" options={{ presentation: 'modal' }} />
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="hrv-summary" options={{ presentation: 'modal' }} />
        <Stack.Screen name="whoop" options={{ presentation: 'modal' }} />
        <Stack.Screen name="whoop-callback" options={{ animation: 'none' }} />
      </Stack>
    </LiveHrvProvider>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <SupabaseProvider>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </SafeAreaProvider>
        </QueryClientProvider>
      </SupabaseProvider>
    </ClerkProvider>
  );
}
