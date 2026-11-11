/**
 * Environment and Global Type Declarations for @finvault/mobile
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly EXPO_PUBLIC_SUPABASE_URL?: string;
      readonly EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
      readonly [key: string]: string | undefined;
    }
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};

export {};
