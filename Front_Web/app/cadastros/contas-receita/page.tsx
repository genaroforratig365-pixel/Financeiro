'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Button, ConfirmModal, Loading, Table, type Column } from '@/components/ui';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

interface ContaReceita {
  ctr_id: number;
  ctr_codigo: string;
  ctr_nome: string;
  ctr_descricao: string | null;
  ctr_ativo: boolean;
  ctr_criado_em: string;
}

export default function ContasReceitaPage() {
  const router = useRouter();
  const [contas, setContas] = useState<ContaReceita[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaReceita | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadContas();
  }, []);

  const loadContas = async () => {
    try {
      setLoading(true);
      const supabase = getSupabaseClient();
      const { userId, userName, userEmail } = getUserSession();
      const { data: user } = await getOrCreateUser(
        supabase,
        userId,
        userName ?? undefined,
        userEmail ?? undefined,
      );

      if (!user) {
        console.error('Usuário não encontrado');
        return;
      }

      const { data, error } = await supabase
        .from('ctr_contas_receita')
        .select('*')
        .order('ctr_codigo', { ascending: true });

      if (error) throw error;
      setContas(data ?? []);
    } catch (error) {
      console.error('Erro ao carregar contas de receita:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredContas = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return contas.filter((conta) => {
      const matchesSearch =
        conta.ctr_codigo.toLowerCase().includes(lower) ||
        conta.ctr_nome.toLowerCase().includes(lower);
      const matchesActive = showInactive || conta.ctr_ativo;
      return matchesSearch && matchesActive;
    });
  }, [contas, searchTerm, showInactive]);

  const columns: Column<ContaReceita>[] = [
    {
      key: 'ctr_codigo',
      label: 'Código',
      sortable: true,
      width: '15%',
    },
    {
      key: 'ctr_nome',
      label: 'Nome',
      sortable: true,
      width: '35%',
    },
    {
      key: 'ctr_descricao',
      label: 'Descrição',
      width: '35%',
      render: (conta) => conta.ctr_descricao || '-',
    },
    {
      key: 'ctr_ativo',
      label: 'Status',
      width: '15%',
      render: (conta) => (
        <span
          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            conta.ctr_ativo
              ? 'bg-success-100 text-success-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {conta.ctr_ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
  ];

  const handleSoftDelete = async () => {
    if (!selectedConta) return;

    try {
      setProcessing(true);
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('ctr_contas_receita')
        .update({ ctr_ativo: false })
        .eq('ctr_id', selectedConta.ctr_id);

      if (error) throw error;

      setContas((prev) =>
        prev.map((conta) =>
          conta.ctr_id === selectedConta.ctr_id
            ? { ...conta, ctr_ativo: false }
            : conta,
        ),
      );
      setModalOpen(false);
      setSelectedConta(null);
    } catch (error) {
      console.error('Erro ao inativar conta:', error);
      alert('Não foi possível inativar a conta. Tente novamente.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <Header
        title="Contas de Receita"
        subtitle="Gerencie as contas utilizadas para classificar as entradas"
        actions={
          <Button variant="primary" onClick={() => router.push('/cadastros/contas-receita/novo')}>
            + Nova Conta
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
            Mostrar inativas
          </label>
        </div>

        {loading ? (
          <Loading size="lg" text="Carregando contas..." />
        ) : (
          <Table
            columns={columns}
            data={filteredContas}
            keyExtractor={(conta) => conta.ctr_id}
            onRowClick={(conta) => router.push(`/cadastros/contas-receita/${conta.ctr_id}/editar`)}
            emptyMessage={
              searchTerm
                ? 'Nenhuma conta encontrada com esses filtros'
                : 'Nenhuma conta cadastrada. Clique em "Nova Conta" para começar.'
            }
            actions={(conta) => (
              <div className="flex gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    router.push(`/cadastros/contas-receita/${conta.ctr_id}/editar`);
                  }}
                  className="text-primary-600 hover:text-primary-900"
                  title="Editar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedConta(conta);
                    setModalOpen(true);
                  }}
                  className="text-error-600 hover:text-error-900"
                  title="Inativar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            )}
          />
        )}
      </div>

      <ConfirmModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedConta(null);
        }}
        onConfirm={handleSoftDelete}
        title="Inativar conta de receita"
        message={`Confirma a inativação da conta "${selectedConta?.ctr_nome}"?`}
        confirmText="Inativar"
        cancelText="Cancelar"
        variant="danger"
        loading={processing}
      />
    </>
  );
}
