'use client';

import React, { useEffect, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { BancoForm, type BancoFormValues } from '@/components/forms/BancoForm';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

interface BancoRecord extends BancoFormValues {
  ban_id: number;
}

export default function EditarBancoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bancoId = Number(params?.id);

  const [initialData, setInitialData] = useState<BancoRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(bancoId)) {
      notFound();
      return;
    }

    const loadBanco = async () => {
      try {
        setLoading(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('ban_bancos')
          .select('ban_id, ban_codigo, ban_nome, ban_numero_conta, ban_agencia, ban_tipo_conta, ban_saldo_inicial, ban_ativo')
          .eq('ban_id', bancoId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          notFound();
          return;
        }

        setInitialData({
          ban_id: data.ban_id,
          ban_codigo: data.ban_codigo,
          ban_nome: data.ban_nome,
          ban_numero_conta: data.ban_numero_conta,
          ban_agencia: data.ban_agencia ?? '',
          ban_tipo_conta: data.ban_tipo_conta ?? 'Corrente',
          ban_saldo_inicial: String(data.ban_saldo_inicial ?? 0),
          ban_ativo: data.ban_ativo,
        });
      } catch (error) {
        console.error('Erro ao carregar banco:', error);
        setFeedback('Não foi possível carregar os dados da conta bancária.');
      } finally {
        setLoading(false);
      }
    };

    loadBanco();
  }, [bancoId]);

  const handleSubmit = async (values: BancoFormValues) => {
    if (!initialData) return;

    try {
      setSubmitting(true);
      setFeedback(null);

      const supabase = getSupabaseClient();
      const { userId, userName, userEmail } = getUserSession();
      const { data: user, error: userError } = await getOrCreateUser(
        supabase,
        userId,
        userName ?? undefined,
        userEmail ?? undefined,
      );

      if (userError) throw userError;
      if (!user) throw new Error('Usuário não encontrado');

      const saldoInicial = Number(values.ban_saldo_inicial.replace(',', '.')) || 0;

      const { error } = await supabase
        .from('ban_bancos')
        .update({
          ban_codigo: values.ban_codigo,
          ban_nome: values.ban_nome,
          ban_numero_conta: values.ban_numero_conta,
          ban_agencia: values.ban_agencia || null,
          ban_tipo_conta: values.ban_tipo_conta || null,
          ban_saldo_inicial: saldoInicial,
          ban_ativo: values.ban_ativo,
        })
        .eq('ban_id', initialData.ban_id);

      if (error) throw error;

      router.push('/cadastros/bancos');
      router.refresh();
    } catch (error: any) {
      console.error('Erro ao atualizar banco:', error);
      setFeedback(error?.message || 'Não foi possível atualizar a conta bancária.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!Number.isFinite(bancoId)) {
    return null;
  }

  return (
    <>
      <Header
        title="Editar Conta Bancária"
        subtitle={
          initialData
            ? `Atualize os dados da conta ${initialData.ban_nome}`
            : undefined
        }
      />

      <div className="page-content">
        <Card>
          {loading && (
            <div className="mb-4">
              <Loading text="Carregando conta bancária..." />
            </div>
          )}

          {feedback && (
            <div className="mb-4 rounded-md border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
              {feedback}
            </div>
          )}

          {!loading && initialData && (
            <BancoForm
              initialValues={initialData}
              onSubmit={handleSubmit}
              onCancel={() => router.push('/cadastros/bancos')}
              loading={submitting}
              submitLabel="Salvar alterações"
            />
          )}
        </Card>
      </div>
    </>
  );
}
