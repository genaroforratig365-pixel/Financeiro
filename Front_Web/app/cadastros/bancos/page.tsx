'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Button, ConfirmModal, Loading, Table, type Column } from '@/components/ui';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { formatCurrency } from '@/lib/mathParser';

interface Banco {
  ban_id: number;
  ban_codigo: string;
  ban_nome: string;
  ban_numero_conta: string;
  ban_agencia: string | null;
  ban_tipo_conta: string | null;
  ban_saldo_inicial: number;
  ban_ativo: boolean;
}

export default function BancosPage() {
  const router = useRouter();
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedBanco, setSelectedBanco] = useState<Banco | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadBancos();
  }, []);

  const loadBancos = async () => {
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
        .from('ban_bancos')
        .select('*')
        .eq('ban_usr_id', user.usr_id)
        .order('ban_codigo', { ascending: true });

      if (error) throw error;
      setBancos(data ?? []);
    } catch (error) {
      console.error('Erro ao carregar bancos:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBancos = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return bancos.filter((banco) => {
      const matchesSearch =
        banco.ban_codigo.toLowerCase().includes(lower) ||
        banco.ban_nome.toLowerCase().includes(lower) ||
        banco.ban_numero_conta.toLowerCase().includes(lower);
      const matchesActive = showInactive || banco.ban_ativo;
      return matchesSearch && matchesActive;
    });
  }, [bancos, searchTerm, showInactive]);

  const columns: Column<Banco>[] = [
    { key: 'ban_codigo', label: 'Código', sortable: true, width: '12%' },
    { key: 'ban_nome', label: 'Nome', sortable: true, width: '28%' },
    {
      key: 'ban_numero_conta',
      label: 'Conta',
      width: '20%',
      render: (banco) => banco.ban_numero_conta,
    },
    {
      key: 'ban_tipo_conta',
      label: 'Tipo',
      width: '15%',
      render: (banco) => banco.ban_tipo_conta || '-',
    },
    {
      key: 'ban_saldo_inicial',
      label: 'Saldo Inicial',
      width: '15%',
      render: (banco) => formatCurrency(Number(banco.ban_saldo_inicial) || 0),
    },
    {
      key: 'ban_ativo',
      label: 'Status',
      width: '10%',
      render: (banco) => (
        <span
          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            banco.ban_ativo
              ? 'bg-success-100 text-success-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {banco.ban_ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
  ];

  const handleSoftDelete = async () => {
    if (!selectedBanco) return;

    try {
      setProcessing(true);
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('ban_bancos')
        .update({ ban_ativo: false })
        .eq('ban_id', selectedBanco.ban_id);

      if (error) throw error;

      setBancos((prev) =>
        prev.map((banco) =>
          banco.ban_id === selectedBanco.ban_id
            ? { ...banco, ban_ativo: false }
            : banco,
        ),
      );
      setModalOpen(false);
      setSelectedBanco(null);
    } catch (error) {
      console.error('Erro ao inativar banco:', error);
      alert('Não foi possível inativar o banco. Tente novamente.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <Header
        title="Bancos"
        subtitle="Cadastre as contas bancárias utilizadas nas movimentações"
        actions={
          <Button variant="primary" onClick={() => router.push('/cadastros/bancos/novo')}>
            + Nova Conta Bancária
          </Button>
        }
      />

      <div className="page-content">
        <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por código, nome ou número da conta..."
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
          <Loading size="lg" text="Carregando bancos..." />
        ) : (
          <Table
            columns={columns}
            data={filteredBancos}
            keyExtractor={(banco) => banco.ban_id}
            onRowClick={(banco) => router.push(`/cadastros/bancos/${banco.ban_id}/editar`)}
            emptyMessage={
              searchTerm
                ? 'Nenhum banco encontrado com esses filtros'
                : 'Nenhuma conta bancária cadastrada. Clique em "Nova Conta Bancária" para começar.'
            }
            actions={(banco) => (
              <div className="flex gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    router.push(`/cadastros/bancos/${banco.ban_id}/editar`);
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
                    setSelectedBanco(banco);
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
          setSelectedBanco(null);
        }}
        onConfirm={handleSoftDelete}
        title="Inativar conta bancária"
        message={`Confirma a inativação da conta "${selectedBanco?.ban_nome}"?`}
        confirmText="Inativar"
        cancelText="Cancelar"
        variant="danger"
        loading={processing}
      />
    </>
  );
}
