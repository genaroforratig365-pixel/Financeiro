'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import {
  ContaReceitaForm,
  type ContaReceitaFormValues,
} from '@/components/forms/ContaReceitaForm';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';

export default function NovaContaReceitaPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = async (values: ContaReceitaFormValues) => {
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

      const { error } = await supabase.from('ctr_contas_receita').insert({
        ctr_codigo: values.ctr_codigo,
        ctr_nome: values.ctr_nome,
        ctr_descricao: values.ctr_descricao || null,
        ctr_ativo: values.ctr_ativo,
        ctr_usr_id: user.usr_id,
      });

      if (error) throw error;

      router.push('/cadastros/contas-receita');
      router.refresh();
    } catch (error: any) {
      console.error('Erro ao salvar conta de receita:', error);
      setFeedback(
        traduzirErroSupabase(
          error,
          'Não foi possível salvar a conta. Verifique os dados e tente novamente.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header
        title="Nova Conta de Receita"
        subtitle="Cadastre uma conta para classificar as receitas da empresa"
      />

      <div className="page-content">
        <Card>
          {submitting && (
            <div className="mb-4">
              <Loading text="Salvando conta..." />
            </div>
          )}

          {feedback && (
            <div className="mb-4 rounded-md border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
              {feedback}
            </div>
          )}

          <ContaReceitaForm
            onSubmit={handleSubmit}
            onCancel={() => router.push('/cadastros/contas-receita')}
            loading={submitting}
          />
        </Card>
      </div>
    </>
  );
}
