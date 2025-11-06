'use client';

import React, { useEffect, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { AreaForm, type AreaFormValues } from '@/components/forms/AreaForm';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

interface AreaRecord extends AreaFormValues {
  are_id: number;
}

export default function EditarAreaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const areaId = Number(params?.id);

  const [initialData, setInitialData] = useState<AreaRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(areaId)) {
      notFound();
      return;
    }

    const loadArea = async () => {
      try {
        setLoading(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('are_areas')
          .select('are_id, are_codigo, are_nome, are_descricao, are_ativo')
          .eq('are_id', areaId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          notFound();
          return;
        }

        setInitialData({
          are_id: data.are_id,
          are_codigo: data.are_codigo,
          are_nome: data.are_nome,
          are_descricao: data.are_descricao ?? '',
          are_ativo: data.are_ativo,
        });
      } catch (error) {
        console.error('Erro ao carregar área:', error);
        setFeedback('Não foi possível carregar os dados da área.');
      } finally {
        setLoading(false);
      }
    };

    loadArea();
  }, [areaId]);

  const handleSubmit = async (values: AreaFormValues) => {
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
        .from('are_areas')
        .update({
          are_codigo: values.are_codigo,
          are_nome: values.are_nome,
          are_descricao: values.are_descricao || null,
          are_ativo: values.are_ativo,
        })
        .eq('are_id', initialData.are_id);

      if (error) throw error;

      router.push('/cadastros/areas');
      router.refresh();
    } catch (error: any) {
      console.error('Erro ao atualizar área:', error);
      setFeedback(error?.message || 'Não foi possível atualizar a área.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!Number.isFinite(areaId)) {
    return null;
  }

  return (
    <>
      <Header
        title="Editar Área"
        subtitle={initialData ? `Atualize os dados da área ${initialData.are_nome}` : undefined}
      />

      <div className="page-content">
        <Card>
          {loading && (
            <div className="mb-4">
              <Loading text="Carregando área..." />
            </div>
          )}

          {feedback && (
            <div className="mb-4 rounded-md border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
              {feedback}
            </div>
          )}

          {!loading && initialData && (
            <AreaForm
              initialValues={initialData}
              onSubmit={handleSubmit}
              onCancel={() => router.push('/cadastros/areas')}
              loading={submitting}
              submitLabel="Salvar alterações"
            />
          )}
        </Card>
      </div>
    </>
  );
}
