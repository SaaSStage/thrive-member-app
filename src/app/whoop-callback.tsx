/**
 * WHOOP OAuth redirect catcher.
 *
 * WHOOP redirects to `thrivememberapp://whoop-callback?code=…` after the member
 * approves. That redirect is consumed by `WebBrowser.openAuthSessionAsync` inside
 * `useConnectWhoop` (which performs the server-side token exchange via the
 * `whoop-link` edge function). On Android the same redirect is ALSO delivered to
 * Expo Router as a deep link — without a matching route that lands on the
 * "Unmatched Route" 404 screen even though the link actually succeeded.
 *
 * This route exists purely to absorb that duplicate delivery cleanly: it
 * completes any pending auth session and returns to the WHOOP screen, which
 * re-reads link status and shows "Connected". It does NOT exchange the code
 * itself — `useConnectWhoop` owns that, so there's no double exchange.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Colors } from '@/constants/theme';

export default function WhoopCallback() {
  useEffect(() => {
    // No-op on native, harmless; dismisses any lingering web auth popup.
    WebBrowser.maybeCompleteAuthSession();
    // Return to the WHOOP screen. Prefer popping the leaked deep-link route so
    // we don't stack a second /whoop; fall back to replace if there's no history.
    if (router.canGoBack()) router.back();
    else router.replace('/whoop');
  }, []);

  // Brief blank screen (matches the app background) before we bounce back.
  return <View style={{ flex: 1, backgroundColor: Colors.dark.background }} />;
}
