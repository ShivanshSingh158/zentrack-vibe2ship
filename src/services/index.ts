/**
 * @file index.ts — Services barrel export
 * @module src/services
 *
 * Re-exports the public API of all ZenTrack service integrations.
 * Note: firebase.ts is intentionally not re-exported here — import db/auth
 * directly from ./firebase to avoid circular dependency risks.
 */
export { isSignedInToGoogle, forceSilentRefresh } from './googleCalendar';
export { synthesizeSpeechSarvam } from './voice/sarvam';
export { SarvamAudioStreamer } from './voice/sarvamStream';
