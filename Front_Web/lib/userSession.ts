/**
 * userSession.ts
 * Gerenciamento de sessão de usuário sem login usando localStorage
 */

import {
  USER_EMAIL_STORAGE_KEY,
  USER_ID_STORAGE_KEY,
  USER_NAME_STORAGE_KEY,
} from "./sessionKeys";

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function safeGetItem(key: string): string | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(
      `[userSession] Não foi possível ler a chave "${key}" do localStorage.`,
      error
    );
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn(
      `[userSession] Não foi possível salvar a chave "${key}" no localStorage.`,
      error
    );
  }
}

function safeRemoveItem(key: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(
      `[userSession] Não foi possível remover a chave "${key}" do localStorage.`,
      error
    );
  }
}

function generateUserId(): string {
  if (isBrowser()) {
    const cryptoApi = window.crypto || (window as unknown as { msCrypto?: Crypto }).msCrypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
      return cryptoApi.randomUUID();
    }
  }

  // Fallback simples caso o browser não suporte crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Obtém o ID do usuário atual.
 * Se não existir, gera um novo UUID e armazena.
 */
export function getUserId(): string {
  if (!isBrowser()) {
    // Server-side: retorna vazio ou um valor padrão
    return "";
  }

  const stored = safeGetItem(USER_ID_STORAGE_KEY);
  if (stored && stored.trim().length > 0) {
    return stored;
  }

  // Gera novo UUID
  const newId = generateUserId();
  safeSetItem(USER_ID_STORAGE_KEY, newId);

  return newId;
}

/**
 * Obtém o identificador salvo sem gerar um novo UUID.
 */
export function getStoredUserId(): string | null {
  const stored = safeGetItem(USER_ID_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  const trimmed = stored.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Define explicitamente o identificador do usuário.
 */
export function setUserId(userId: string): void {
  const trimmed = userId?.trim?.() ?? "";
  if (trimmed.length === 0) {
    safeRemoveItem(USER_ID_STORAGE_KEY);
    return;
  }

  safeSetItem(USER_ID_STORAGE_KEY, trimmed);
}

/**
 * Obtém o nome/apelido do usuário
 */
export function getUserName(): string | null {
  const value = safeGetItem(USER_NAME_STORAGE_KEY);
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Obtém o e-mail do usuário (se definido)
 */
export function getUserEmail(): string | null {
  const value = safeGetItem(USER_EMAIL_STORAGE_KEY);
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Define o nome/apelido do usuário
 */
export function setUserName(name: string): void {
  const trimmed = name?.trim?.() ?? "";
  if (trimmed.length === 0) {
    safeRemoveItem(USER_NAME_STORAGE_KEY);
    return;
  }

  safeSetItem(USER_NAME_STORAGE_KEY, trimmed);
}

/**
 * Remove o nome/apelido do usuário armazenado
 */
export function clearUserName(): void {
  safeRemoveItem(USER_NAME_STORAGE_KEY);
}

/**
 * Define o e-mail do usuário
 */
export function setUserEmail(email: string): void {
  const trimmed = email?.trim?.() ?? "";
  if (trimmed.length === 0) {
    safeRemoveItem(USER_EMAIL_STORAGE_KEY);
    return;
  }

  safeSetItem(USER_EMAIL_STORAGE_KEY, trimmed);
}

/**
 * Remove o e-mail do usuário
 */
export function clearUserEmail(): void {
  safeRemoveItem(USER_EMAIL_STORAGE_KEY);
}

/**
 * Limpa toda a sessão do usuário
 * CUIDADO: Isso fará com que o usuário perca acesso aos seus dados
 */
export function clearUserSession(): void {
  safeRemoveItem(USER_ID_STORAGE_KEY);
  safeRemoveItem(USER_NAME_STORAGE_KEY);
  safeRemoveItem(USER_EMAIL_STORAGE_KEY);
}

export type UserSessionSnapshot = {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  displayName: string;
};

/**
 * Retorna informações completas da sessão
 */
export function getUserSession(): UserSessionSnapshot {
  const userId = getUserId();
  const userName = getUserName();
  const userEmail = getUserEmail();

  return {
    userId,
    userName,
    userEmail,
    displayName: userName ?? "Usuário Anônimo",
  };
}

/**
 * Verifica se o usuário tem sessão ativa
 */
export function hasActiveSession(): boolean {
  const userId = safeGetItem(USER_ID_STORAGE_KEY);
  return !!(userId && userId.trim().length > 0);
}
