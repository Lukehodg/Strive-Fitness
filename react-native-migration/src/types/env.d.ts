declare module '@env' {
  export const API_URL: string;
  export const DEV_API_URL: string;
  export const NUTRITIONIX_APP_ID: string;
  export const NUTRITIONIX_API_KEY: string;
  export const ENABLE_DEBUG_LOGGING: string;
  export const ENABLE_ANALYTICS: string;
  export const ENABLE_CRASH_REPORTING: string;
  export const DEFAULT_THEME: 'light' | 'dark';
  export const DEFAULT_LANGUAGE: string;
}

// Define global types for Expo
declare global {
  // Used in API client to determine dev vs prod environment
  const __DEV__: boolean;
}

export {};