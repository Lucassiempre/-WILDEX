import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import {
  DEFAULT_GEMINI_MODEL,
  executeAnimalRecognitionRequest,
  GEMINI_TIMEOUT_MS,
  MAX_REQUEST_CHARACTERS,
  recognizeWithGemini,
} from "../_shared/animalRecognitionCore.ts";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonResponse = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
const trace = (message: string) => console.log(`[identify-animal] ${message}`);
const quoted = (value: unknown) => JSON.stringify(value ?? null);
const errorType = (error: unknown) => error instanceof Error ? error.name : "unknown";

Deno.serve(async (request) => {
  const requestStartedAt = Date.now();
  trace("request-start");
  try {
    if (request.method === "OPTIONS") return new Response("ok", { headers });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
    if (!supabaseUrl || !anonKey || !geminiApiKey) {
      trace("error type=server_misconfigured");
      return jsonResponse(500, { ok: false, error: "server_misconfigured" });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_CHARACTERS) {
      trace("error type=image_too_large source=content-length");
      return jsonResponse(413, { ok: false, error: "image_too_large" });
    }
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > MAX_REQUEST_CHARACTERS) {
        trace("error type=image_too_large source=request-body");
        return jsonResponse(413, { ok: false, error: "image_too_large" });
      }
      body = JSON.parse(text);
    } catch {
      trace("error type=invalid_request");
      return jsonResponse(400, { ok: false, error: "invalid_request" });
    }

    const authorization = request.headers.get("Authorization");
    const client = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: authorization ? { Authorization: authorization } : {} },
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const result = await executeAnimalRecognitionRequest({
        method: request.method,
        authorization,
        body,
        signal: controller.signal,
      }, {
        verifyToken: async (token) => {
          const { data: { user }, error } = await client.auth.getUser(token);
          return { userId: user?.id, error };
        },
        listCatalog: async () => {
          const { data, error } = await client.from("species")
            .select("id, common_name, scientific_name, keywords")
            .eq("active", true);
          return { data, error };
        },
        recognize: (image, signal) => {
          trace(`image mime=${image.mimeType} sizeBytes=${image.sizeBytes}`);
          return recognizeWithGemini({
            apiKey: geminiApiKey,
            model: geminiModel,
            image,
            signal,
            diagnostics: {
              onStart: ({ model, timestamp }) => trace(`gemini-start model=${model} timestamp=${timestamp}`),
              onResponse: ({ status, durationMs }) => trace(`gemini-response status=${status ?? "unavailable"} durationMs=${durationMs}`),
              onJsonParsed: ({ success }) => trace(`json-parsed success=${success}`),
            },
          });
        },
      });
      const resultBody = result.body as Record<string, unknown>;
      if (result.status === 200 && resultBody.result && typeof resultBody.result === "object") {
        const recognition = resultBody.result as Record<string, unknown>;
        trace(`parsed detectedAnimal=${recognition.detectedAnimal === true} commonName=${quoted(recognition.commonName)} scientificName=${quoted(recognition.scientificName)} confidence=${String(recognition.confidence ?? "unknown")}`);
        trace(`catalog-match speciesId=${quoted(recognition.possibleSpeciesId)}`);
      } else {
        trace(`error type=${String(resultBody.error ?? "recognition_failed")}`);
      }
      return jsonResponse(result.status, result.body);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    trace(`error type=${errorType(error)}`);
    throw error;
  } finally {
    trace(`request-end durationMs=${Date.now() - requestStartedAt}`);
  }
});
