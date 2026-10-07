import { readSupabaseConfig } from "../config/supabaseConfig";

const form = document.getElementById("beta-form") as HTMLFormElement | null;
const emailInput = document.getElementById("tester-email") as HTMLInputElement | null;
const consentInput = document.getElementById("tester-consent") as HTMLInputElement | null;
const submitButton = document.getElementById("beta-submit") as HTMLButtonElement | null;
const message = document.getElementById("beta-message") as HTMLElement | null;

const setMessage = (text: string, tone: "idle" | "success" | "error" = "idle") => {
  if (!message) return;
  message.textContent = text;
  message.dataset.tone = tone;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isValidEmail = (value: string) => {
  if (value.length < 3 || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value);
};

const setBusy = (busy: boolean) => {
  if (!submitButton || !emailInput || !consentInput) return;
  submitButton.disabled = busy;
  emailInput.disabled = busy;
  consentInput.disabled = busy;
  submitButton.textContent = busy ? "Enviando..." : "Quiero ser tester";
};

const submitTesterRequest = async (email: string, consented: boolean) => {
  const config = readSupabaseConfig(import.meta.env);
  const endpoint = new URL("/functions/v1/join-beta", config.url);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": config.publishableKey,
      "Authorization": `Bearer ${config.publishableKey}`,
    },
    body: JSON.stringify({ email, consented }),
  });

  if (response.status === 409) return "duplicate";
  if (!response.ok) throw new Error("join-beta failed");
  return "created";
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!emailInput || !consentInput) return;

  const email = normalizeEmail(emailInput.value);
  if (!isValidEmail(email)) {
    setMessage("Ingresá un email válido.", "error");
    emailInput.focus();
    return;
  }

  if (!consentInput.checked) {
    setMessage("Necesitamos tu consentimiento para anotarte como tester.", "error");
    consentInput.focus();
    return;
  }

  setBusy(true);
  setMessage("");
  try {
    const result = await submitTesterRequest(email, consentInput.checked);
    if (result === "duplicate") {
      setMessage("Este correo ya está anotado para la beta.", "success");
      return;
    }
    setMessage("¡Listo! Te anotaste para participar en la beta de Wildex.", "success");
    form.reset();
  } catch {
    setMessage("No pudimos registrar tu correo. Intentá nuevamente.", "error");
  } finally {
    setBusy(false);
  }
});
