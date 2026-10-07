import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const allowedOrigins = new Set([
  "https://lucassiempre.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const corsHeaders = (request: Request) => {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "https://lucassiempre.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

const response = (request: Request, status: number, body: Record<string, unknown>) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
    },
  });
};

const normalizeEmail = (value: unknown) => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email)) return null;
  return email;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return response(request, 405, { ok: false, code: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return response(request, 500, { ok: false, code: "server_misconfigured" });
  }

  let payload: { email?: unknown; consented?: unknown };
  try {
    payload = await request.json();
  } catch {
    return response(request, 400, { ok: false, code: "invalid_request" });
  }

  const email = normalizeEmail(payload.email);
  if (!email || payload.consented !== true) {
    return response(request, 400, { ok: false, code: "invalid_request" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin
    .from("beta_testers")
    .insert({ email, consented: true });

  if (error?.code === "23505") {
    return response(request, 409, { ok: false, code: "duplicate" });
  }
  if (error) {
    return response(request, 500, { ok: false, code: "insert_failed" });
  }

  return response(request, 201, { ok: true });
});
