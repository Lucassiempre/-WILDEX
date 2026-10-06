import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig, type SupabasePublicEnvironment } from "../config/supabaseConfig";
import { AUTH_STORAGE_KEY, createAuthStorage, type AuthStorage } from "../services/authStorage";

let sharedClient: SupabaseClient | undefined;

export const createWildexSupabaseClient = (
  environment: SupabasePublicEnvironment,
  storage: AuthStorage = createAuthStorage(),
): SupabaseClient => {
  const config = readSupabaseConfig(environment);
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      storage,
      storageKey: AUTH_STORAGE_KEY,
    },
  });
};

export const getSupabaseClient = (): SupabaseClient => {
  sharedClient ??= createWildexSupabaseClient(import.meta.env);
  return sharedClient;
};
