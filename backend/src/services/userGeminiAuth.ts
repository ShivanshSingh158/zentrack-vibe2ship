import { ensureToken, signInWithGoogle, forceSilentRefresh } from './googleCalendar';

const LOCAL_TOKEN_STORE  = 'zen_user_gemini_oauth_token';
const LOCAL_TOKEN_EXPIRY = 'zen_user_gemini_oauth_expiry';

// IMPORTANT: Do NOT request 'generative-language' (full) scope here.
// That scope causes Error 400: invalid_scope unless the GCP project has
// explicit enrollment. 'generative-language.retriever' is the safe, valid scope
// for Google AI Studio / Gemini API resource access.
// Gemini generateContent() only accepts API keys — not OAuth bearer tokens.
// const GEMINI_SCOPE = 'https://www.googleapis.com/auth/generative-language.retriever';

let _cachedToken: string | null = null;
let _tokenExpiry: number = 0;
let _keySource: 'personal' | 'shared' = 'shared';
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

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

// ── Proactive Background Token Refresh ────────────────────────────────────────
// Schedules a silent refresh 5 minutes before the token expires.
// This prevents the personal key from ever expiring mid-session and forcing a
// silent fallback to the shared pool.
const scheduleTokenRefresh = (expiryMs: number) => {
  if (_refreshTimer) clearTimeout(_refreshTimer);

  const msUntilExpiry = expiryMs - Date.now();
  const refreshIn = msUntilExpiry - 5 * 60 * 1000; // 5 minutes before expiry

  if (refreshIn <= 0) return; // Already near or past expiry — skip

  console.log(`[ZenAI] Personal token refresh scheduled in ${Math.round(refreshIn / 60000)} minutes.`);
  _refreshTimer = setTimeout(async () => {
    console.log('[ZenAI] 🔄 Proactively refreshing personal OAuth token (silent)...');
    try {
      // Use forceSilentRefresh — this calls the backend /api/auth/refresh endpoint
      // and NEVER opens an OAuth popup (which would be blocked without a user gesture).
      await forceSilentRefresh();
      const token = await ensureToken();
      _cachedToken = token;
      const gcalExpiry = localStorage.getItem('zen_gcal_token_expiry');
      _tokenExpiry = gcalExpiry ? parseInt(gcalExpiry, 10) : (Date.now() + 55 * 60 * 1000);
      localStorage.setItem(LOCAL_TOKEN_STORE, token);
      localStorage.setItem(LOCAL_TOKEN_EXPIRY, _tokenExpiry.toString());
      scheduleTokenRefresh(_tokenExpiry);
      dispatchAuthChange();
      console.log('[ZenAI] ✅ Personal OAuth token silently refreshed.');
    } catch (err) {
      console.warn('[ZenAI] ⚠️ Silent token refresh failed. Will use shared pool if personal key expires.', err);
      // Do NOT open a popup here — user must re-connect manually via GeminiAuthModal
    }
  }, refreshIn);
};

// ── Token Validity Guard (single source of truth) ─────────────────────────────
export const isPersonalTokenValid = (): boolean => {
  return !!_cachedToken && Date.now() < _tokenExpiry;
};

export const loadUserGeminiKey = async (): Promise<string | null> => {
  const cached = localStorage.getItem(LOCAL_TOKEN_STORE);
  const expiry = parseInt(localStorage.getItem(LOCAL_TOKEN_EXPIRY) || '0', 10);
  
  if (cached) {
    if (Date.now() >= expiry) {
      // Token is expired. Clear it and fall back to shared.
      await deleteUserGeminiKey();
      return null;
    }
    _cachedToken = cached;
    _tokenExpiry = expiry;
    _keySource = 'personal';
    scheduleTokenRefresh(expiry); // ✅ Start the background refresh timer on page load
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
  return !!_cachedToken && Date.now() >= _tokenExpiry;
};

export const wasEverConnectedToPersonalGemini = (): boolean => {
  return !!localStorage.getItem(LOCAL_TOKEN_STORE);
};

export const requestGeminiToken = async (): Promise<string> => {
  // Enforce a fresh login prompt to guarantee the user account choice window appears
  await signInWithGoogle();
  
  // Now that signInWithGoogle has resolved, ensureToken will return the fresh token
  const token = await ensureToken();
  _cachedToken = token;
  
  // Extract expiry from localstorage gcal token or fallback to 55 minutes
  const gcalExpiry = localStorage.getItem('zen_gcal_token_expiry');
  _tokenExpiry = gcalExpiry ? parseInt(gcalExpiry, 10) : (Date.now() + 55 * 60 * 1000);
  
  _keySource = 'personal';
  localStorage.setItem(LOCAL_TOKEN_STORE, token);
  localStorage.setItem(LOCAL_TOKEN_EXPIRY, _tokenExpiry.toString());
  
  scheduleTokenRefresh(_tokenExpiry); // ✅ Start background refresh after every new token
  dispatchAuthChange();
  return token;
};

export const deleteUserGeminiKey = async (): Promise<void> => {
  _cachedToken = null;
  _tokenExpiry = 0;
  _keySource = 'shared';
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  localStorage.removeItem(LOCAL_TOKEN_STORE);
  localStorage.removeItem(LOCAL_TOKEN_EXPIRY);
  dispatchAuthChange();
};

export const getActiveGeminiKey = (): string | null => {
  // CRITICAL: Never return an expired token. Returning an expired token causes
  // the fetch interceptor to inject a dead bearer token into every single API call,
  // which causes a flood of 401 errors before fallback can kick in.
  if (_cachedToken && Date.now() >= _tokenExpiry) {
    console.warn('[ZenAI] Personal OAuth token expired in-memory. Clearing and switching to shared pool.');
    _cachedToken = null;
    _tokenExpiry = 0;
    _keySource = 'shared';
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
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
    hasPersonalKey: isPersonalTokenValid(),
    maskedKey: _cachedToken ? `OAuth...${_cachedToken.slice(-4)}` : null,
  };
};

export const setAuthExpired = () => {
  deleteUserGeminiKey();
};
