'use client';

import React, { useEffect, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import {
  ContaReceitaForm,
  type ContaReceitaFormValues,
} from '@/components/forms/ContaReceitaForm';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

interface ContaReceitaRecord extends ContaReceitaFormValues {
  ctr_id: number;
}

export default function EditarContaReceitaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const contaId = Number(params?.id);

  const [initialData, setInitialData] = useState<ContaReceitaRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(contaId)) {
      notFound();
      return;
    }

    const loadConta = async () => {
      try {
        setLoading(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('ctr_contas_receita')
          .select('ctr_id, ctr_codigo, ctr_nome, ctr_descricao, ctr_ativo')
          .eq('ctr_id', contaId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          notFound();
          return;
        }

        setInitialData({
          ctr_id: data.ctr_id,
          ctr_codigo: data.ctr_codigo,
          ctr_nome: data.ctr_nome,
          ctr_descricao: data.ctr_descricao ?? '',
          ctr_ativo: data.ctr_ativo,
        });
      } catch (error) {
        console.error('Erro ao carregar conta:', error);
        setFeedback('Não foi possível carregar os dados da conta.');
      } finally {
        setLoading(false);
      }
    };

    loadConta();
  }, [contaId]);

  const handleSubmit = async (values: ContaReceitaFormValues) => {
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

      const { error } = await supabase
        .from('ctr_contas_receita')
        .update({
          ctr_codigo: values.ctr_codigo,
          ctr_nome: values.ctr_nome,
          ctr_descricao: values.ctr_descricao || null,
          ctr_ativo: values.ctr_ativo,
        })
        .eq('ctr_id', initialData.ctr_id);

      if (error) throw error;

      router.push('/cadastros/contas-receita');
      router.refresh();
    } catch (error: any) {
      console.error('Erro ao atualizar conta:', error);
      setFeedback(error?.message || 'Não foi possível atualizar a conta.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!Number.isFinite(contaId)) {
    return null;
  }

  return (
    <>
      <Header
        title="Editar Conta de Receita"
        subtitle={
          initialData
            ? `Ajuste as informações da conta ${initialData.ctr_nome}`
            : undefined
        }
      />

      <div className="page-content">
        <Card>
          {loading && (
            <div className="mb-4">
              <Loading text="Carregando conta..." />
            </div>
          )}

          {feedback && (
            <div className="mb-4 rounded-md border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
              {feedback}
            </div>
          )}

          {!loading && initialData && (
            <ContaReceitaForm
              initialValues={initialData}
              onSubmit={handleSubmit}
              onCancel={() => router.push('/cadastros/contas-receita')}
              loading={submitting}
              submitLabel="Salvar alterações"
            />
          )}
        </Card>
      </div>
    </>
  );
}
