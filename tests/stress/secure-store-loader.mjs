export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'expo-secure-store') {
    return {
      format: 'module',
      shortCircuit: true,
      url: new URL('./mock-secure-store.mjs', import.meta.url).href,
    };
  }
  return nextResolve(specifier, context);
}
