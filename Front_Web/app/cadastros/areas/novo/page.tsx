'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { AreaForm, type AreaFormValues } from '@/components/forms/AreaForm';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

export default function NovaAreaPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = async (values: AreaFormValues) => {
    try {
      setFeedback(null);
      setSubmitting(true);

      const supabase = getSupabaseClient();
      const { userId, userName, userEmail } = getUserSession();
      const { data: user, error: userError } = await getOrCreateUser(
        supabase,
        userId,
        userName ?? undefined,
        userEmail ?? undefined,
      );

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error('Usuário não encontrado para associar a área.');
      }

      const { error } = await supabase.from('are_areas').insert({
        are_codigo: values.are_codigo,
        are_nome: values.are_nome,
        are_descricao: values.are_descricao || null,
        are_ativo: values.are_ativo,
        are_usr_id: user.usr_id,
      });

      if (error) {
        throw error;
      }

      router.push('/cadastros/areas');
      router.refresh();
    } catch (error: any) {
      console.error('Erro ao salvar área:', error);
      setFeedback(
        error?.message || 'Não foi possível salvar a área. Tente novamente mais tarde.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header
        title="Nova Área"
        subtitle="Cadastre uma nova área de negócio para organizar as movimentações"
      />

      <div className="page-content">
        <Card>
          {submitting && (
            <div className="mb-4">
              <Loading text="Salvando área..." />
            </div>
          )}

          {feedback && (
            <div className="mb-4 rounded-md border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
              {feedback}
            </div>
          )}

          <AreaForm
            onSubmit={handleSubmit}
            onCancel={() => router.push('/cadastros/areas')}
            loading={submitting}
          />
        </Card>
      </div>
    </>
  );
}
