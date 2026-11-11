const assert = require('assert');

// Mock SecureStore simulating iOS Keychain with 2048-byte limit
const mockStorage = new Map();
const MAX_ITEM_SIZE = 2048;

const MockSecureStore = {
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async (key) => {
    return mockStorage.has(key) ? mockStorage.get(key) : null;
  },
  setItemAsync: async (key, value, options) => {
    if (Buffer.byteLength(value, 'utf8') > MAX_ITEM_SIZE) {
      throw new Error(`[MockSecureStore] Key "${key}" exceeds iOS Keychain limit of ${MAX_ITEM_SIZE} bytes (got ${Buffer.byteLength(value, 'utf8')} bytes)`);
    }
    mockStorage.set(key, value);
  },
  deleteItemAsync: async (key) => {
    mockStorage.delete(key);
  },
};

// Implement Chunked Adapter with simulated MockSecureStore
const CHUNK_SIZE = 1024; // Safe size well below 2048 bytes
const MAX_ALLOWED_SIZE = 100 * 1024; // 100KB max for auth tokens

const ChunkedSecureStoreAdapter = {
  getItem: async (key) => {
    try {
      const chunksStr = await MockSecureStore.getItemAsync(`${key}_chunks`);
      if (chunksStr) {
        const count = parseInt(chunksStr, 10);
        if (!isNaN(count) && count > 0) {
          let assembled = '';
          for (let i = 0; i < count; i++) {
            const chunk = await MockSecureStore.getItemAsync(`${key}_chunk_${i}`);
            if (chunk === null) {
              console.warn(`[SecureStore] Incomplete chunks for key: ${key}, missing chunk ${i}`);
              return null;
            }
            assembled += chunk;
          }
          return assembled;
        }
      }
      return await MockSecureStore.getItemAsync(key);
    } catch (err) {
      console.warn('[SecureStore] Failed to retrieve key:', key, err);
      return null;
    }
  },

  setItem: async (key, value) => {
    try {
      if (value.length > MAX_ALLOWED_SIZE) {
        throw new Error(`[SecureStore] Value exceeds maximum allowed session size of ${MAX_ALLOWED_SIZE} bytes`);
      }

      const prevChunksStr = await MockSecureStore.getItemAsync(`${key}_chunks`);
      const prevCount = prevChunksStr ? parseInt(prevChunksStr, 10) : 0;
      const chunks = Math.ceil(value.length / CHUNK_SIZE);

      if (chunks <= 1) {
        // Save unchunked
        await MockSecureStore.setItemAsync(key, value, {
          keychainAccessible: MockSecureStore.AFTER_FIRST_UNLOCK,
        });

        // Clean up previous chunks if any
        for (let i = 0; i < prevCount; i++) {
          await MockSecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        if (prevCount > 0) {
          await MockSecureStore.deleteItemAsync(`${key}_chunks`);
        }
      } else {
        // Save chunks
        for (let i = 0; i < chunks; i++) {
          const chunk = value.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await MockSecureStore.setItemAsync(`${key}_chunk_${i}`, chunk, {
            keychainAccessible: MockSecureStore.AFTER_FIRST_UNLOCK,
          });
        }
        await MockSecureStore.setItemAsync(`${key}_chunks`, chunks.toString(), {
          keychainAccessible: MockSecureStore.AFTER_FIRST_UNLOCK,
        });

        // Clean up excess previous chunks if prevCount > chunks
        for (let i = chunks; i < prevCount; i++) {
          await MockSecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        // Remove direct key to avoid stale state
        await MockSecureStore.deleteItemAsync(key);
      }
    } catch (err) {
      console.error('[SecureStore] Failed to set key:', key, err);
      throw err;
    }
  },

  removeItem: async (key) => {
    try {
      const chunksStr = await MockSecureStore.getItemAsync(`${key}_chunks`);
      if (chunksStr) {
        const count = parseInt(chunksStr, 10);
        if (!isNaN(count) && count > 0) {
          for (let i = 0; i < count; i++) {
            await MockSecureStore.deleteItemAsync(`${key}_chunk_${i}`);
          }
        }
        await MockSecureStore.deleteItemAsync(`${key}_chunks`);
      }
      await MockSecureStore.deleteItemAsync(key);
    } catch (err) {
      console.warn('[SecureStore] Failed to remove key:', key, err);
    }
  },
};

// Test Suite
async function runTests() {
  console.log('--- Test 1: Small payload (< 1KB) ---');
  const smallKey = 'sb-test-small';
  const smallVal = JSON.stringify({ user: 'alice', token: 'xyz123' });
  await ChunkedSecureStoreAdapter.setItem(smallKey, smallVal);
  assert.strictEqual(await ChunkedSecureStoreAdapter.getItem(smallKey), smallVal);
  assert.strictEqual(mockStorage.has(smallKey), true);
  assert.strictEqual(mockStorage.has(`${smallKey}_chunks`), false);
  console.log('✓ Test 1 passed');

  console.log('--- Test 2: Large payload (> 2048 bytes, e.g. 4KB Google OAuth session) ---');
  const largeKey = 'sb-test-large';
  const largeVal = JSON.stringify({
    access_token: 'A'.repeat(1500),
    refresh_token: 'B'.repeat(500),
    user: {
      id: 'usr_123',
      email: 'alice@example.com',
      metadata: 'C'.repeat(1500),
    },
  });
  assert(largeVal.length > 3500, 'Payload should exceed 3.5KB');
  
  // Directly writing to MockSecureStore should fail:
  let directThrew = false;
  try {
    await MockSecureStore.setItemAsync(largeKey, largeVal);
  } catch (e) {
    directThrew = true;
  }
  assert.strictEqual(directThrew, true, 'Direct setItemAsync must throw on > 2048 bytes');

  // Chunked adapter should succeed:
  await ChunkedSecureStoreAdapter.setItem(largeKey, largeVal);
  const retrievedLarge = await ChunkedSecureStoreAdapter.getItem(largeKey);
  assert.strictEqual(retrievedLarge, largeVal, 'Retrieved value must match original');
  assert.strictEqual(mockStorage.has(largeKey), false, 'Direct key should be removed');
  assert.strictEqual(mockStorage.get(`${largeKey}_chunks`), '4');
  console.log('✓ Test 2 passed: successfully stored and retrieved 3.5KB payload across 4 chunks without hitting 2KB limit');

  console.log('--- Test 3: Shrinking payload (4 chunks -> 1 chunk) ---');
  await ChunkedSecureStoreAdapter.setItem(largeKey, smallVal);
  assert.strictEqual(await ChunkedSecureStoreAdapter.getItem(largeKey), smallVal);
  assert.strictEqual(mockStorage.has(largeKey), true);
  assert.strictEqual(mockStorage.has(`${largeKey}_chunks`), false);
  assert.strictEqual(mockStorage.has(`${largeKey}_chunk_0`), false);
  assert.strictEqual(mockStorage.has(`${largeKey}_chunk_3`), false);
  console.log('✓ Test 3 passed: cleanly removed old chunks when overwritten with small value');

  console.log('--- Test 4: Removal ---');
  await ChunkedSecureStoreAdapter.setItem(largeKey, largeVal);
  assert.strictEqual(mockStorage.has(`${largeKey}_chunks`), true);
  await ChunkedSecureStoreAdapter.removeItem(largeKey);
  assert.strictEqual(await ChunkedSecureStoreAdapter.getItem(largeKey), null);
  assert.strictEqual(mockStorage.has(`${largeKey}_chunks`), false);
  assert.strictEqual(mockStorage.has(`${largeKey}_chunk_0`), false);
  assert.strictEqual(mockStorage.has(largeKey), false);
  console.log('✓ Test 4 passed: removeItem cleaned up all chunks');

  console.log('--- Test 5: Size guard rejection (> 100KB) ---');
  let guardThrew = false;
  try {
    await ChunkedSecureStoreAdapter.setItem('too-big', 'X'.repeat(120 * 1024));
  } catch (e) {
    guardThrew = true;
  }
  assert.strictEqual(guardThrew, true, 'Values exceeding max size must throw');
  console.log('✓ Test 5 passed: rejected > 100KB');

  console.log('\nALL 5 TESTS PASSED CLEANLY!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
