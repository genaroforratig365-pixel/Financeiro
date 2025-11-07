'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Header } from '@/components/layout';
import { Button, ConfirmModal, Loading, Table, type Column } from '@/components/ui';
import { getOrCreateUser, getSupabaseClient } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

interface TipoReceita {
  tpr_id: number;
  tpr_codigo: string;
  tpr_nome: string;
  tpr_descricao: string | null;
  tpr_ativo: boolean;
  tpr_criado_em: string;
}

export default function TiposReceitaPage() {
  const router = useRouter();
  const [tipos, setTipos] = useState<TipoReceita[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<TipoReceita | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadTipos();
  }, []);

  const loadTipos = async () => {
    try {
      setLoading(true);
      const supabase = getSupabaseClient();
      const { userId, userName, userEmail } = getUserSession();
      await getOrCreateUser(supabase, userId, userName ?? undefined, userEmail ?? undefined);

      const { data, error } = await supabase
        .from('tpr_tipos_receita')
        .select('*')
        .order('tpr_codigo', { ascending: true });

      if (error) throw error;
      setTipos(data ?? []);
    } catch (error) {
      console.error('Erro ao carregar tipos de receita:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTipos = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return tipos.filter((tipo) => {
      const matchesSearch =
        tipo.tpr_codigo.toLowerCase().includes(lower) ||
        tipo.tpr_nome.toLowerCase().includes(lower);
      const matchesActive = showInactive || tipo.tpr_ativo;
      return matchesSearch && matchesActive;
    });
  }, [tipos, searchTerm, showInactive]);

  const columns: Column<TipoReceita>[] = [
    {
      key: 'tpr_codigo',
      label: 'Código',
      sortable: true,
      width: '20%',
    },
    {
      key: 'tpr_nome',
      label: 'Nome',
      sortable: true,
      width: '40%',
    },
    {
      key: 'tpr_descricao',
      label: 'Descrição',
      width: '25%',
      render: (tipo) => tipo.tpr_descricao || '-',
    },
    {
      key: 'tpr_ativo',
      label: 'Status',
      width: '15%',
      render: (tipo) => (
        <span
          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            tipo.tpr_ativo ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {tipo.tpr_ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
  ];

  const handleSoftDelete = async () => {
    if (!selectedTipo) return;

    try {
      setProcessing(true);
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('tpr_tipos_receita')
        .update({ tpr_ativo: false })
        .eq('tpr_id', selectedTipo.tpr_id);

      if (error) throw error;

      setTipos((prev) =>
        prev.map((tipo) =>
          tipo.tpr_id === selectedTipo.tpr_id ? { ...tipo, tpr_ativo: false } : tipo,
        ),
      );
      setModalOpen(false);
      setSelectedTipo(null);
    } catch (error) {
      console.error('Erro ao inativar tipo de receita:', error);
      alert('Não foi possível inativar o tipo. Tente novamente.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <Header
        title="Tipos de Receita"
        subtitle="Cadastre as categorias utilizadas para cobrança e relatórios"
        actions={
          <Button variant="primary" onClick={() => router.push('/cadastros/tipos-receita/novo')}>
            + Novo Tipo
          </Button>
        }
      />

      <div className="page-content">
        <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por código ou nome..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
            />
            Mostrar inativos
          </label>
        </div>

        {loading ? (
          <Loading size="lg" text="Carregando tipos de receita..." />
        ) : (
          <Table
            columns={columns}
            data={filteredTipos}
            keyExtractor={(tipo) => tipo.tpr_id}
            onRowClick={(tipo) => router.push(`/cadastros/tipos-receita/${tipo.tpr_id}/editar`)}
            emptyMessage={
              searchTerm
                ? 'Nenhum tipo encontrado com esses filtros'
                : 'Nenhum tipo cadastrado. Clique em "Novo Tipo" para começar.'
            }
            actions={(tipo) => (
              <div className="flex gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    router.push(`/cadastros/tipos-receita/${tipo.tpr_id}/editar`);
                  }}
                  className="text-primary-600 hover:text-primary-900"
                  title="Editar"
                >
                  Editar
                </button>
                {tipo.tpr_ativo && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedTipo(tipo);
                      setModalOpen(true);
                    }}
                    className="text-error-600 hover:text-error-900"
                    title="Inativar"
                  >
                    Inativar
                  </button>
                )}
              </div>
            )}
          />
        )}
      </div>

      <ConfirmModal
        isOpen={modalOpen}
        title="Inativar tipo de receita"
        message="Esta ação impedirá o uso deste tipo nas próximas movimentações."
        confirmText="Inativar"
        cancelText="Cancelar"
        loading={processing}
        onConfirm={handleSoftDelete}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
