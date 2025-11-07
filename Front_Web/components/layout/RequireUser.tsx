'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { hasActiveSession } from '@/lib/userSession';

/**
 * Redireciona o usuário para a seleção de operador quando não houver sessão ativa.
 */
export function RequireUser() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/') {
      return;
    }

    if (!hasActiveSession()) {
      router.replace('/');
    }
  }, [pathname, router]);

  return null;
}

export default RequireUser;
