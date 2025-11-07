/**
 * Áreas - Listagem
 * Tela de listagem de áreas com busca, filtros e ações
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Button, Table, ConfirmModal, Loading } from '@/components/ui';
import type { Column } from '@/components/ui';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

interface Area {
  are_id: number;
  are_codigo: string;
  are_nome: string;
  are_descricao: string | null;
  are_ativo: boolean;
  are_criado_em: string;
}

export default function AreasPage() {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [areaToDelete, setAreaToDelete] = useState<Area | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    loadAreas();
  }, []);

  const loadAreas = async () => {
    try {
      setLoading(true);
      const { userId } = getUserSession();
      const supabase = getSupabaseClient();
      const { data: user } = await getOrCreateUser(supabase, userId);

      if (!user) {
        console.error('Usuário não encontrado');
        return;
      }

      const { data, error } = await supabase
        .from('are_areas')
        .select('*')
        .order('are_codigo', { ascending: true });

      if (error) throw error;
      setAreas(data || []);
    } catch (error) {
      console.error('Erro ao carregar áreas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!areaToDelete) return;

    try {
      setDeleting(true);
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('are_areas')
        .update({ are_ativo: false })
        .eq('are_id', areaToDelete.are_id);

      if (error) throw error;

      setAreas((prev) =>
        prev.map((area) =>
          area.are_id === areaToDelete.are_id
            ? { ...area, are_ativo: false }
            : area,
        ),
      );
      setDeleteModalOpen(false);
      setAreaToDelete(null);
    } catch (error) {
      console.error('Erro ao deletar área:', error);
      alert('Erro ao desativar área. Verifique se não há registros vinculados.');
    } finally {
      setDeleting(false);
    }
  };

  const filteredAreas = areas.filter((area) => {
    const matchesSearch =
      area.are_codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      area.are_nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActive = showInactive || area.are_ativo;
    return matchesSearch && matchesActive;
  });

  const columns: Column<Area>[] = [
    {
      key: 'are_codigo',
      label: 'Código',
      sortable: true,
      width: '15%',
    },
    {
      key: 'are_nome',
      label: 'Nome',
      sortable: true,
      width: '30%',
    },
    {
      key: 'are_descricao',
      label: 'Descrição',
      width: '35%',
      render: (area) => area.are_descricao || '-',
    },
    {
      key: 'are_ativo',
      label: 'Status',
      width: '10%',
      render: (area) => (
        <span
          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            area.are_ativo
              ? 'bg-success-100 text-success-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {area.are_ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
  ];

  return (
    <>
      <Header
        title="Áreas"
        subtitle="Cadastro de áreas de negócio e departamentos"
        actions={
          <Button
            variant="primary"
            onClick={() => router.push('/cadastros/areas/novo')}
          >
            + Nova Área
          </Button>
        }
      />

      <div className="page-content">
        {/* Filtros */}
        <div className="mb-6 flex gap-4 items-center">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por código ou nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
            />
            Mostrar inativos
          </label>
        </div>

        {/* Tabela */}
        {loading ? (
          <Loading size="lg" text="Carregando áreas..." />
        ) : (
          <Table
            columns={columns}
            data={filteredAreas}
            keyExtractor={(area) => area.are_id}
            onRowClick={(area) =>
              router.push(`/cadastros/areas/${area.are_id}/editar`)
            }
            loading={loading}
            emptyMessage={
              searchTerm
                ? 'Nenhuma área encontrada com esses filtros'
                : 'Nenhuma área cadastrada. Clique em "Nova Área" para começar.'
            }
            actions={(area) => (
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/cadastros/areas/${area.are_id}/editar`);
                  }}
                  className="text-primary-600 hover:text-primary-900"
                  title="Editar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAreaToDelete(area);
                    setDeleteModalOpen(true);
                  }}
                  className="text-error-600 hover:text-error-900"
                  title="Excluir"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          />
        )}
      </div>

      {/* Modal de confirmação de exclusão */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setAreaToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Excluir Área"
        message={`Tem certeza que deseja inativar a área "${areaToDelete?.are_nome}"? Você poderá reativá-la posteriormente.`}
        confirmText="Inativar"
        cancelText="Manter ativa"
        variant="danger"
        loading={deleting}
      />
    </>
  );
}
