export const ANDROID_AUTH_REDIRECT_URL = "com.mrlabs.wildex://auth/callback";

export type NativeOAuthCallback =
  | { kind: "ignore" }
  | { kind: "cancelled" }
  | { kind: "error"; message: string }
  | { kind: "code"; code: string; flowId?: string };

const isWildexAuthCallback = (url: URL) => (
  url.protocol === "com.mrlabs.wildex:"
  && url.hostname === "auth"
  && url.pathname === "/callback"
);

export const parseNativeOAuthCallback = (rawUrl: string): NativeOAuthCallback => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "ignore" };
  }

  if (!isWildexAuthCallback(url)) return { kind: "ignore" };

  const oauthError = url.searchParams.get("error");
  const oauthErrorCode = url.searchParams.get("error_code");
  if (oauthError === "access_denied" || oauthErrorCode === "access_denied") {
    return { kind: "cancelled" };
  }
  if (oauthError || oauthErrorCode) {
    return { kind: "error", message: "Google no pudo completar el inicio de sesión." };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return { kind: "error", message: "El retorno de Google no incluyó un código de autorización." };
  }

  const flowId = url.searchParams.get("sb_flow_id") ?? undefined;
  return { kind: "code", code, flowId };
};
