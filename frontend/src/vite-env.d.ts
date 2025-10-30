/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  // add other VITE_ vars here if you use more
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
