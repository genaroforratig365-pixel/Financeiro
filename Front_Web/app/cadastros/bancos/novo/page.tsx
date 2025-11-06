'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { BancoForm, type BancoFormValues } from '@/components/forms/BancoForm';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';

export default function NovoBancoPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = async (values: BancoFormValues) => {
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

      const { error } = await supabase.from('ban_bancos').insert({
        ban_codigo: values.ban_codigo,
        ban_nome: values.ban_nome,
        ban_numero_conta: values.ban_numero_conta,
        ban_agencia: values.ban_agencia || null,
        ban_tipo_conta: values.ban_tipo_conta || null,
        ban_saldo_inicial: saldoInicial,
        ban_ativo: values.ban_ativo,
        ban_usr_id: user.usr_id,
      });

      if (error) throw error;

      router.push('/cadastros/bancos');
      router.refresh();
    } catch (error: any) {
      console.error('Erro ao salvar banco:', error);
      setFeedback(
        traduzirErroSupabase(
          error,
          'Não foi possível salvar a conta bancária.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header
        title="Nova Conta Bancária"
        subtitle="Cadastre as contas utilizadas para movimentações financeiras"
      />

      <div className="page-content">
        <Card>
          {submitting && (
            <div className="mb-4">
              <Loading text="Salvando conta bancária..." />
            </div>
          )}

          {feedback && (
            <div className="mb-4 rounded-md border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
              {feedback}
            </div>
          )}

          <BancoForm
            onSubmit={handleSubmit}
            onCancel={() => router.push('/cadastros/bancos')}
            loading={submitting}
          />
        </Card>
      </div>
    </>
  );
}
