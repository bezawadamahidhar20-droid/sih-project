/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Set to '1' to enable demo mode: bundled mock data is used ONLY when the
   *  backend is genuinely unreachable (network error). Off by default. */
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
