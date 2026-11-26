declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
  }
}

declare var process: {
  env: NodeJS.ProcessEnv;
};

declare var __DEV__: boolean;
