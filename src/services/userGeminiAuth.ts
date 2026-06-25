import { GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup } from 'firebase/auth';
import { auth } from './firebase';

const LOCAL_TOKEN_STORE = 'zen_user_gemini_oauth_token';
const LOCAL_TOKEN_EXPIRY = 'zen_user_gemini_oauth_expiry';
const GEMINI_SCOPE = 'https://www.googleapis.com/auth/generative-language.retriever';

let _cachedToken: string | null = null;
let _tokenExpiry: number = 0;
let _keySource: 'personal' | 'shared' = 'shared';

export type KeySource = 'personal' | 'shared';

export interface GeminiKeyStatus {
  source: KeySource;
  hasPersonalKey: boolean;
  maskedKey: string | null;
}

const dispatchAuthChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('gemini-auth-changed'));
  }
};

export const loadUserGeminiKey = async (): Promise<string | null> => {
  const cached = localStorage.getItem(LOCAL_TOKEN_STORE);
  const expiry = parseInt(localStorage.getItem(LOCAL_TOKEN_EXPIRY) || '0', 10);
  
  if (cached) {
    if (Date.now() >= expiry) {
      // Token is expired. We don't load it.
      deleteUserGeminiKey();
      return null;
    }
    _cachedToken = cached;
    _tokenExpiry = expiry;
    _keySource = 'personal';
    dispatchAuthChange();
    return cached;
  }
  
  _cachedToken = null;
  _tokenExpiry = 0;
  _keySource = 'shared';
  dispatchAuthChange();
  return null;
};

export const isPersonalGeminiTokenExpired = (): boolean => {
  // If we have a cached token but it's past the expiry date, return true
  return !!_cachedToken && Date.now() >= _tokenExpiry;
};

export const wasEverConnectedToPersonalGemini = (): boolean => {
  return !!localStorage.getItem(LOCAL_TOKEN_STORE);
};

export const requestGeminiToken = async (): Promise<string> => {
  const provider = new GoogleAuthProvider();
  provider.addScope(GEMINI_SCOPE);
  
  let result;
  const user = auth.currentUser;
  if (user) {
    try {
      result = await reauthenticateWithPopup(user, provider);
    } catch {
      result = await signInWithPopup(auth, provider);
    }
  } else {
    result = await signInWithPopup(auth, provider);
  }
  
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;
  if (!token) throw new Error('Could not get access token from Google.');
  
  _cachedToken = token;
  // Google OAuth tokens expire in 1 hour. We set expiry to 55 minutes to be safe.
  _tokenExpiry = Date.now() + 55 * 60 * 1000;
  _keySource = 'personal';
  localStorage.setItem(LOCAL_TOKEN_STORE, token);
  localStorage.setItem(LOCAL_TOKEN_EXPIRY, _tokenExpiry.toString());
  dispatchAuthChange();
  return token;
};

export const deleteUserGeminiKey = async (): Promise<void> => {
  _cachedToken = null;
  _tokenExpiry = 0;
  _keySource = 'shared';
  localStorage.removeItem(LOCAL_TOKEN_STORE);
  localStorage.removeItem(LOCAL_TOKEN_EXPIRY);
  dispatchAuthChange();
};

export const getActiveGeminiKey = (): string | null => {
  // CRITICAL: Never return an expired token. Returning an expired token causes
  // the fetch interceptor to inject a dead bearer token into every single API call,
  // which causes a flood of 401 errors before fallback can kick in.
  if (_cachedToken && Date.now() >= _tokenExpiry) {
    console.warn('[ZenAI] Personal OAuth token expired in-memory. Clearing.');
    _cachedToken = null;
    _tokenExpiry = 0;
    _keySource = 'shared';
    // Clear from localStorage too so wasEverConnectedToPersonalGemini doesn't stale-trigger
    localStorage.removeItem(LOCAL_TOKEN_STORE);
    localStorage.removeItem(LOCAL_TOKEN_EXPIRY);
    dispatchAuthChange();
    return null;
  }
  return _cachedToken;
};

export const getKeyStatus = (): GeminiKeyStatus => {
  return {
    source: _keySource,
    hasPersonalKey: !!_cachedToken,
    maskedKey: _cachedToken ? `OAuth...${_cachedToken.slice(-4)}` : null,
  };
};

export const setAuthExpired = () => {
  deleteUserGeminiKey();
};
