/**
 * Header Component
 * Cabeçalho com título da página e informações do usuário
 */

'use client';

import React from 'react';
import UserIdentifier from './UserIdentifier';

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  const currentDate = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="header">
      <div className="flex items-center justify-between">
        {/* Título e Data */}
        <div>
          {title && (
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          )}
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
          {!subtitle && (
            <p className="text-sm text-gray-500 mt-1 capitalize">
              {currentDate}
            </p>
          )}
        </div>

        {/* Actions e User */}
        <div className="flex items-center gap-4">
          {actions && <div>{actions}</div>}
          <UserIdentifier />
        </div>
      </div>
    </header>
  );
};

Header.displayName = 'Header';

export default Header;
