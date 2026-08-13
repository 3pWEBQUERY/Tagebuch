"use client";

export type SessionUser = { id: string; email: string };

export type SessionInfo = {
  user: SessionUser | null;
  signupCodeRequired: boolean;
};

async function readError(response: Response, fallback: string): Promise<string> {
  return response
    .json()
    .then((d: { error?: string }) => d.error ?? fallback)
    .catch(() => fallback);
}

export async function readSession(): Promise<SessionInfo> {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Anmeldestatus nicht abrufbar"));
  return (await response.json()) as SessionInfo;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await readError(response, "Anmeldung fehlgeschlagen"));
  return ((await response.json()) as { user: SessionUser }).user;
}

export async function register(
  email: string,
  password: string,
  code?: string,
): Promise<SessionUser> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, code }),
  });
  if (!response.ok) throw new Error(await readError(response, "Registrierung fehlgeschlagen"));
  return ((await response.json()) as { user: SessionUser }).user;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" });
}

export async function deleteAccount(): Promise<void> {
  const response = await fetch("/api/auth/account", { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response, "Konto konnte nicht gelöscht werden"));
}
