/// <reference types="vite/client" />

declare const __EFTIRMAL_ENV__: {
  readonly DEBUG?: string;
  readonly VITE_API_URL?: string;
};

interface Window {
  readonly __EFTIRMAL_ENV__?: {
    readonly DEBUG?: string;
    readonly VITE_API_URL?: string;
  };
}
