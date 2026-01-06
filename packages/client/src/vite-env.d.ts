/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Enable service worker in dev mode (default: false) */
  readonly VITE_ENABLE_SW?: string;
  /** Disable client-side markdown rendering fallback (default: true, set to "false" to enable) */
  readonly VITE_DISABLE_CLIENT_MARKDOWN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
