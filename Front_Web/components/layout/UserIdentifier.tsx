/**
 * UserIdentifier Component
 * Mostra informações do usuário e permite definir nome
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  clearUserSession,
  getUserSession,
} from '@/lib/userSession';
import { Button } from '../ui/Button';

interface UserSessionData {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  displayName: string;
}

export const UserIdentifier: React.FC = () => {
  const router = useRouter();
  const [session, setSession] = useState<UserSessionData>({
    userId: '',
    userName: null,
    userEmail: null,
    displayName: 'Selecione um usuário',
  });

  useEffect(() => {
    const userSession = getUserSession();
    setSession(userSession);
  }, []);

  const handleTrocarUsuario = () => {
    clearUserSession();
    setSession(getUserSession());
    router.push('/');
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-sm font-medium text-primary-700">
              {session.displayName.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* Nome */}
          <div className="hidden md:block">
            <p className="text-sm font-medium text-gray-900">
              {session.displayName}
            </p>
            {session.userId && (
              <p className="text-xs text-gray-500">
                ID: {session.userId.slice(0, 8)}...
              </p>
            )}
            {session.userEmail && (
              <p className="text-xs text-gray-500 mt-0.5">
                {session.userEmail}
              </p>
            )}
          </div>
          </div>

        <Button variant="ghost" size="sm" onClick={handleTrocarUsuario}>
          Trocar usuário
        </Button>
      </div>
    </>
  );
};

UserIdentifier.displayName = 'UserIdentifier';

export default UserIdentifier;
