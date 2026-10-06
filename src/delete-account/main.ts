import "./styles.css";
import {
  beginGoogleDeleteAccountLogin,
  buildDeleteAccountRedirectUrl,
  clearDeleteAccountBrowserSession,
  createDeleteAccountWebClient,
  deleteAuthenticatedWildexAccount,
  exchangeDeleteAccountOAuthReturn,
  isDeleteAccountConfirmationValid,
} from "./deleteAccountWebClient";

const requiredElement = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta el elemento ${id}.`);
  return element as T;
};

const authSection = requiredElement<HTMLElement>("auth-section");
const confirmationSection = requiredElement<HTMLElement>("confirmation-section");
const successSection = requiredElement<HTMLElement>("success-section");
const loginButton = requiredElement<HTMLButtonElement>("google-login");
const changeAccountButton = requiredElement<HTMLButtonElement>("change-account");
const deleteButton = requiredElement<HTMLButtonElement>("delete-account");
const confirmationInput = requiredElement<HTMLInputElement>("confirmation-input");
const accountEmail = requiredElement<HTMLElement>("account-email");
const statusMessage = requiredElement<HTMLElement>("status-message");
const errorMessage = requiredElement<HTMLElement>("error-message");

const client = createDeleteAccountWebClient(import.meta.env);
const redirectUrl = buildDeleteAccountRedirectUrl(window.location.origin, import.meta.env.BASE_URL);
let busy = false;

const showError = (message?: string) => {
  errorMessage.textContent = message ?? "";
  errorMessage.hidden = !message;
};

const setStatus = (message = "") => {
  statusMessage.textContent = message;
};

const setBusy = (value: boolean) => {
  busy = value;
  loginButton.disabled = value;
  changeAccountButton.disabled = value;
  confirmationInput.disabled = value;
  deleteButton.disabled = value || !isDeleteAccountConfirmationValid(confirmationInput.value);
};

const showAuthenticatedAccount = (email?: string) => {
  authSection.hidden = true;
  successSection.hidden = true;
  confirmationSection.hidden = false;
  accountEmail.textContent = email || "Cuenta de Google autenticada";
  confirmationInput.value = "";
  deleteButton.disabled = true;
  confirmationInput.focus();
};

const showSignedOut = () => {
  authSection.hidden = false;
  confirmationSection.hidden = true;
  successSection.hidden = true;
  accountEmail.textContent = "";
  confirmationInput.value = "";
  deleteButton.disabled = true;
};

confirmationInput.addEventListener("input", () => {
  deleteButton.disabled = busy || !isDeleteAccountConfirmationValid(confirmationInput.value);
});

loginButton.addEventListener("click", async () => {
  showError();
  setStatus("Abriendo Google para autenticar tu cuenta...");
  setBusy(true);
  try {
    await beginGoogleDeleteAccountLogin(client, redirectUrl);
  } catch {
    showError("No se pudo iniciar sesión con Google. Revisá tu conexión e intentá nuevamente.");
    setStatus();
    setBusy(false);
  }
});

changeAccountButton.addEventListener("click", async () => {
  showError();
  setBusy(true);
  await clearDeleteAccountBrowserSession(client);
  showSignedOut();
  setStatus("Elegí la cuenta de Google que querés eliminar.");
  setBusy(false);
  loginButton.click();
});

deleteButton.addEventListener("click", async () => {
  if (!isDeleteAccountConfirmationValid(confirmationInput.value)) return;
  showError();
  setStatus("Eliminando fotografías y datos sincronizados...");
  setBusy(true);
  try {
    await deleteAuthenticatedWildexAccount(client);
    await clearDeleteAccountBrowserSession(client);
    authSection.hidden = true;
    confirmationSection.hidden = true;
    successSection.hidden = false;
    window.history.replaceState({}, "", redirectUrl);
    setStatus("El proceso terminó correctamente.");
  } catch {
    showError("No se pudo eliminar la cuenta. No se limpió la sesión y podés volver a intentarlo.");
    setStatus();
    setBusy(false);
  }
});

const initialize = async () => {
  setBusy(true);
  showError();
  try {
    if (new URL(window.location.href).searchParams.has("code")) {
      setStatus("Completando el inicio de sesión...");
      await exchangeDeleteAccountOAuthReturn(client, window.location.href);
      window.history.replaceState({}, "", redirectUrl);
    } else {
      await exchangeDeleteAccountOAuthReturn(client, window.location.href);
    }

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session?.user) showAuthenticatedAccount(data.session.user.email);
    else showSignedOut();
    setStatus();
  } catch {
    showSignedOut();
    showError("No se pudo completar el inicio de sesión. Volvé a intentarlo con Google.");
    window.history.replaceState({}, "", redirectUrl);
    setStatus();
  } finally {
    setBusy(false);
  }
};

void initialize();
