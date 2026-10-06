import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Capacitor } from "@capacitor/core";

export type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const AUTH_STORAGE_KEY = "wildex-auth-v1";

type SecureStorageAdapter = Pick<typeof SecureStorage, "getItem" | "setItem" | "removeItem">;

export const createMemoryAuthStorage = (): AuthStorage => {
  const values = new Map<string, string>();

  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
};

export const createNativeAuthStorage = (storage: SecureStorageAdapter = SecureStorage): AuthStorage => ({
  getItem: (key) => storage.getItem(key),
  setItem: (key, value) => storage.setItem(key, value),
  removeItem: (key) => storage.removeItem(key),
});

export const createAuthStorage = (): AuthStorage => (
  Capacitor.isNativePlatform() ? createNativeAuthStorage() : createMemoryAuthStorage()
);

export const clearStoredAuthSession = () => createAuthStorage().removeItem(AUTH_STORAGE_KEY);
