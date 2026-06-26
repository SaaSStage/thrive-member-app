/**
 * WHOOP OAuth front-channel (PKCE S256).
 *
 * Responsibilities:
 *   - Build the authorize URL with PKCE challenge.
 *   - Open the system browser via WebBrowser.openAuthSessionAsync.
 *   - Validate the state parameter and extract the auth code.
 *   - Return { code, codeVerifier, redirectUri } to the caller.
 *
 * Token exchange is NOT done here — it happens server-side in the
 * `whoop-link` edge function so WHOOP credentials never touch the device.
 *
 * Mirrors VoiceUploadError: a typed error class for clean catch handling.
 */
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

// ---- WHOOP OAuth endpoints --------------------------------------------------

export const WHOOP_AUTHORIZE_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';

/** All scopes the app needs from the WHOOP API. */
const WHOOP_SCOPES = [
  'read:recovery',
  'read:sleep',
  'read:cycles',
  'read:workout',
  'read:profile',
  'read:body_measurement',
  'offline',
].join(' ');

// ---- Typed error ------------------------------------------------------------

export class WhoopOAuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'cancelled' | 'state_mismatch' | 'no_code' | 'no_client_id',
  ) {
    super(message);
    this.name = 'WhoopOAuthError';
  }
}

// ---- PKCE helpers -----------------------------------------------------------

/** 43–128 char URL-safe random string (RFC 7636). */
async function generateCodeVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(48);
  // base64url encode (no padding, replace +/ with -_)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * S256 PKCE challenge: BASE64URL(SHA256(ASCII(verifier))).
 * expo-crypto's digestStringAsync returns BASE64 (with padding) when asked;
 * we strip padding and fix the alphabet manually.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  // BASE64URL: strip trailing '=', replace +→- and /→_
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ---- Authorize URL ----------------------------------------------------------

export async function buildAuthorizeUrl(): Promise<{
  url: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
}> {
  const clientId = process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID;
  if (!clientId) {
    throw new WhoopOAuthError(
      'EXPO_PUBLIC_WHOOP_CLIENT_ID is not set.',
      'no_client_id',
    );
  }

  const redirectUri = Linking.createURL('whoop-callback');
  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = Crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: WHOOP_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const url = `${WHOOP_AUTHORIZE_URL}?${params.toString()}`;
  return { url, codeVerifier, state, redirectUri };
}

// ---- Main entry point -------------------------------------------------------

/**
 * Run the full WHOOP OAuth front-channel.
 * Opens the browser, waits for the redirect, validates state, and returns
 * the auth code + PKCE verifier for the server-side token exchange.
 */
export async function runWhoopOAuth(): Promise<{
  code: string;
  codeVerifier: string;
  redirectUri: string;
}> {
  const { url, codeVerifier, state, redirectUri } = await buildAuthorizeUrl();

  const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);

  // User cancelled or browser dismissed without a redirect.
  if (result.type !== 'success') {
    throw new WhoopOAuthError('WHOOP authorisation was cancelled.', 'cancelled');
  }

  // Parse the redirect URL for code + state.
  const parsed = Linking.parse(result.url);
  const returnedState = parsed.queryParams?.['state'];
  const code = parsed.queryParams?.['code'];

  if (returnedState !== state) {
    throw new WhoopOAuthError('OAuth state mismatch — possible CSRF.', 'state_mismatch');
  }

  if (!code || typeof code !== 'string') {
    throw new WhoopOAuthError('No authorization code returned.', 'no_code');
  }

  return { code, codeVerifier, redirectUri };
}
