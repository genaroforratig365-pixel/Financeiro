/**
 * userSession.ts
 * Gerenciamento de sessão de usuário sem login
 * Usa UUID armazenado no localStorage para identificação
 */

const USER_ID_KEY = 'financeiro_user_id';
const USER_NAME_KEY = 'financeiro_user_name';
const USER_EMAIL_KEY = 'financeiro_user_email';

/**
 * Obtém o ID do usuário atual
 * Se não existir, gera um novo UUID e armazena
 */
export function getUserId(): string {
  if (typeof window === 'undefined') {
    // Server-side: retorna vazio ou um valor padrão
    return '';
  }

  const stored = localStorage.getItem(USER_ID_KEY);
  if (stored) {
    return stored;
  }

  // Gera novo UUID
  const newId = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, newId);

  return newId;
}

/**
 * Obtém o nome/apelido do usuário (se definido)
 */
export function getUserName(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(USER_NAME_KEY);
}

/**
 * Obtém o e-mail do usuário (se definido)
 */
export function getUserEmail(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(USER_EMAIL_KEY);
}

/**
 * Define o nome/apelido do usuário
 */
export function setUserName(name: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(USER_NAME_KEY, name);
}

/**
 * Define o e-mail do usuário
 */
export function setUserEmail(email: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(USER_EMAIL_KEY, email);
}

/**
 * Remove o nome do usuário
 */
export function clearUserName(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(USER_NAME_KEY);
}

/**
 * Remove o e-mail do usuário
 */
export function clearUserEmail(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(USER_EMAIL_KEY);
}

/**
 * Limpa toda a sessão do usuário
 * CUIDADO: Isso fará com que o usuário perca acesso aos seus dados
 */
export function clearUserSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_NAME_KEY);
  localStorage.removeItem(USER_EMAIL_KEY);
}

/**
 * Retorna informações completas da sessão
 */
export function getUserSession() {
  return {
    userId: getUserId(),
    userName: getUserName(),
    userEmail: getUserEmail(),
    displayName: getUserName() || 'Usuário Anônimo',
  };
}

/**
 * Verifica se o usuário tem sessão ativa
 */
export function hasActiveSession(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return !!localStorage.getItem(USER_ID_KEY);
}
