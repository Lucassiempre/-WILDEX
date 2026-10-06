export type SupabasePublicEnvironment = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

const requiredValue = (value: string | undefined, name: keyof SupabasePublicEnvironment) => {
  const normalized = value?.trim();
  if (!normalized) throw new SupabaseConfigurationError(`Falta ${name}. Configurala en .env.local antes de iniciar o compilar Wildex.`);
  return normalized;
};

const normalizeProjectUrl = (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SupabaseConfigurationError("VITE_SUPABASE_URL debe ser una URL válida del proyecto Supabase.");
  }

  const localDevelopment = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(localDevelopment && parsed.protocol === "http:")) {
    throw new SupabaseConfigurationError("VITE_SUPABASE_URL debe usar HTTPS, excepto durante desarrollo local de Supabase.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new SupabaseConfigurationError("VITE_SUPABASE_URL no debe incluir credenciales, parámetros ni fragmentos.");
  }

  return parsed.toString().replace(/\/$/, "");
};

const validatePublishableKey = (value: string) => {
  if (value.startsWith("sb_secret_") || /service[_-]?role/i.test(value)) {
    throw new SupabaseConfigurationError("Wildex sólo admite una publishable key en el cliente. Nunca uses una secret key o service_role.");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) {
    throw new SupabaseConfigurationError("VITE_SUPABASE_PUBLISHABLE_KEY debe contener la publishable key con prefijo sb_publishable_.");
  }
  return value;
};

export const readSupabaseConfig = (environment: SupabasePublicEnvironment): SupabasePublicConfig => ({
  url: normalizeProjectUrl(requiredValue(environment.VITE_SUPABASE_URL, "VITE_SUPABASE_URL")),
  publishableKey: validatePublishableKey(requiredValue(
    environment.VITE_SUPABASE_PUBLISHABLE_KEY,
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  )),
});
