/// <reference types="vite/client" />

// Extend env types if needed
interface ImportMetaEnv {
  readonly VITE_DEV_MODE?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
