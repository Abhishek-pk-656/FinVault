export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';

export const mockStorage = new Map();
export const KEYCHAIN_LIMIT = 2048; // iOS Keychain hard limit in bytes

export async function getItemAsync(key) {
  return mockStorage.has(key) ? mockStorage.get(key) : null;
}

export async function setItemAsync(key, value, options) {
  const byteLength = Buffer.byteLength(value, 'utf8');
  if (byteLength > KEYCHAIN_LIMIT) {
    throw new Error(`[iOS Keychain Quota Exceeded] Key "${key}" size ${byteLength} bytes exceeds hardware limit of ${KEYCHAIN_LIMIT} bytes`);
  }
  mockStorage.set(key, value);
}

export async function deleteItemAsync(key) {
  mockStorage.delete(key);
}

export function resetMockStorage() {
  mockStorage.clear();
}
