import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { ACCOUNT_PHOTO_BUCKET, executeDeleteAccountRequest } from "../_shared/deleteAccountCore.ts";

const jsonHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const response = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: { ...jsonHeaders, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return response(500, { ok: false, error: "server_misconfigured" });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await executeDeleteAccountRequest({
    method: request.method,
    authorization: request.headers.get("Authorization"),
  }, {
    verifyToken: async (token) => {
      const { data: { user }, error } = await admin.auth.getUser(token);
      return { userId: user?.id, error };
    },
    storage: admin.storage.from(ACCOUNT_PHOTO_BUCKET),
    deleteAuthUser: (userId) => admin.auth.admin.deleteUser(userId, false),
  });
  return response(result.status, result.body);
});
