/// <reference types="vite/client" />

declare const __MINNUMST_ENV__: {
  readonly DEBUG?: string;
  readonly VITE_API_URL?: string;
};

interface Window {
  readonly __MINNUMST_ENV__?: {
    readonly DEBUG?: string;
    readonly VITE_API_URL?: string;
  };
}
