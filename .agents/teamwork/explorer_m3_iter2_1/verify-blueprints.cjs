const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- BLUEPRINT VERIFICATION HARNESS ---');

// 1. Verify Middleware Blueprint
const middlewarePath = 'apps/web/src/middleware.ts';
const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');

// Check the existing problematic lines
const hasProblematicRemove = /remove\s*\(\s*name\s*:\s*string\s*,\s*options\s*:\s*CookieOptions\s*\)\s*\{[\s\S]*?request\.cookies\.set\(\{\s*name,\s*value,\s*\.\.\.options\s*\}\);/.test(middlewareContent);
console.log('Existing middleware.ts has bug:', hasProblematicRemove);
assert.strictEqual(hasProblematicRemove, true, 'middleware.ts should contain the reported bug');

// Test the proposed replacement
const fixedMiddleware = middlewareContent.replace(
  /request\.cookies\.set\(\{\s*name,\s*value,\s*\.\.\.options\s*\}\);/g,
  "request.cookies.set({ name, value: '', ...options });"
).replace(
  /response\.cookies\.set\(\{\s*name,\s*value,\s*\.\.\.options\s*\}\);/g,
  "response.cookies.set({ name, value: '', ...options });"
);

assert(!fixedMiddleware.includes('{ name, value, ...options }'), 'Fixed content should not contain shorthand value');
assert(fixedMiddleware.includes("request.cookies.set({ name, value: '', ...options });"), 'Fixed content should have value: empty string');
assert(fixedMiddleware.includes("response.cookies.set({ name, value: '', ...options });"), 'Fixed content should have value: empty string');
console.log('✓ Middleware replacement verified');

// 2. Verify Mobile Import Extensions
const clientPath = 'apps/mobile/src/lib/supabase/client.ts';
const clientContent = fs.readFileSync(clientPath, 'utf8');
const oauthPath = 'apps/mobile/src/lib/auth/oauth.ts';
const oauthContent = fs.readFileSync(oauthPath, 'utf8');

assert(clientContent.includes("from './secure-store-adapter.ts';"), 'client.ts should contain .ts extension');
assert(oauthContent.includes("from '../supabase/client.ts';"), 'oauth.ts should contain .ts extension');

const fixedClient = clientContent.replace("from './secure-store-adapter.ts';", "from './secure-store-adapter';");
const fixedOAuth = oauthContent.replace("from '../supabase/client.ts';", "from '../supabase/client';");

assert(!fixedClient.includes('.ts\';'), 'fixedClient should not have .ts extension');
assert(!fixedOAuth.includes('.ts\';'), 'fixedOAuth should not have .ts extension');
console.log('✓ Mobile imports replacement verified');

console.log('\nAll blueprint validations succeeded!');
