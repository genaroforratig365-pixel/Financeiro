/**
 * UserIdentifier Component
 * Mostra informações do usuário e permite definir nome
 */

'use client';

import React, { useState, useEffect } from 'react';
import { getUserSession, setUserName as saveUserName } from '@/lib/userSession';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

export const UserIdentifier: React.FC = () => {
  const [session, setSession] = useState({ userId: '', userName: '', displayName: '' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const userSession = getUserSession();
    setSession(userSession);
    setNewName(userSession.userName || '');
  }, []);

  const handleSaveName = () => {
    if (newName.trim()) {
      saveUserName(newName.trim());
      setSession(getUserSession());
      setIsModalOpen(false);
    }
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
            <p className="text-xs text-gray-500">
              ID: {session.userId.slice(0, 8)}...
            </p>
          </div>
        </div>

        {/* Botão para editar nome */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Definir nome"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </button>
      </div>

      {/* Modal para definir nome */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Identificação do Usuário"
        footer={
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveName}
              disabled={!newName.trim()}
            >
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Defina um nome ou apelido para facilitar a identificação. Isso não
            afeta seus dados, apenas torna a interface mais pessoal.
          </p>

          <Input
            label="Nome ou Apelido"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Digite seu nome"
            autoFocus
            fullWidth
          />

          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-500">
              <strong>Seu ID único:</strong> {session.userId}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Este ID está salvo no seu navegador e identifica seus registros.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
};

UserIdentifier.displayName = 'UserIdentifier';

export default UserIdentifier;
