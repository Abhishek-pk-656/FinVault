import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1024; // 1KB chunks guaranteed well within iOS Keychain 2048-byte limit
const MAX_ALLOWED_SIZE = 100 * 1024; // 100KB guard against abnormal runaway payloads

export const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const chunksStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunksStr) {
        const count = parseInt(chunksStr, 10);
        if (!isNaN(count) && count > 0) {
          let assembled = '';
          for (let i = 0; i < count; i++) {
            const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
            if (chunk === null) {
              console.warn(`[SecureStore] Incomplete chunks for key: ${key}, missing chunk ${i}`);
              return null;
            }
            assembled += chunk;
          }
          return assembled;
        }
      }
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      console.warn('[SecureStore] Failed to retrieve key:', key, err);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (value.length > MAX_ALLOWED_SIZE) {
        throw new Error(`[SecureStore] Value exceeds maximum allowed session size of ${MAX_ALLOWED_SIZE} bytes`);
      }

      const prevChunksStr = await SecureStore.getItemAsync(`${key}_chunks`);
      const prevCount = prevChunksStr ? parseInt(prevChunksStr, 10) : 0;
      const chunks = Math.ceil(value.length / CHUNK_SIZE);

      if (chunks <= 1) {
        // Single chunk / small value: store unchunked directly
        await SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });

        // Clean up any old chunks if previously chunked
        for (let i = 0; i < prevCount; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        if (prevCount > 0) {
          await SecureStore.deleteItemAsync(`${key}_chunks`);
        }
      } else {
        // Multi-chunk value: write all chunks
        for (let i = 0; i < chunks; i++) {
          const chunk = value.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk, {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
          });
        }
        await SecureStore.setItemAsync(`${key}_chunks`, chunks.toString(), {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });

        // Clean up excess previous chunks if prevCount > chunks
        for (let i = chunks; i < prevCount; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        // Remove direct key to avoid ambiguous state
        await SecureStore.deleteItemAsync(key);
      }
    } catch (err) {
      console.error('[SecureStore] Failed to set key:', key, err);
      throw err;
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      const chunksStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunksStr) {
        const count = parseInt(chunksStr, 10);
        if (!isNaN(count) && count > 0) {
          for (let i = 0; i < count; i++) {
            await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
          }
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`);
      }
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      console.warn('[SecureStore] Failed to remove key:', key, err);
    }
  },
};
