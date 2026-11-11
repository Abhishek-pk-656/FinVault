/**
 * Isomorphic RFC4122 v4 UUID Generator
 * 
 * Generates standards-compliant UUIDs across Node.js, Hermes (React Native),
 * modern Web Browsers, and Web Workers without requiring node:crypto.
 */
export function generateUUID(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  // RFC4122 v4 compliant fallback for Hermes / legacy environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
