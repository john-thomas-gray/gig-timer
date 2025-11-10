export {};

declare global {
  const chrome:
    | undefined
    | {
        runtime?: {
          getManifest?: () => unknown;
          lastError?: Error;
        };
        storage?: {
          local?: {
            get: (
              keys: string[] | Record<string, unknown>,
              callback: (items: Record<string, unknown>) => void
            ) => void;
            set: (
              items: Record<string, unknown>,
              callback?: () => void
            ) => void;
          };
        };
      };
}
