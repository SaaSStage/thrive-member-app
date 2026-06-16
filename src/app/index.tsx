import { useAuth } from '@clerk/clerk-expo';
import { Redirect, type Href } from 'expo-router';

/** Cold-start entry: send the user to the right group once Clerk is ready. */
export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return <Redirect href={(isSignedIn ? '/(tabs)' : '/(auth)/welcome') as Href} />;
}
