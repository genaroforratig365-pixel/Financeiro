'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading, Textarea } from '@/components/ui';
import { getOrCreateUser, getSupabaseClient } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';

interface TipoReceita {
  tpr_id: number;
  tpr_codigo: string;
  tpr_nome: string;
  tpr_descricao: string | null;
  tpr_ativo: boolean;
}

export default function EditarTipoReceitaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const tipoId = Number(params?.id);

  const [dados, setDados] = useState<TipoReceita | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(tipoId)) {
      router.push('/cadastros/tipos-receita');
      return;
    }

    const load = async () => {
      try {
        setCarregando(true);
        const supabase = getSupabaseClient();
        const { userId, userName, userEmail } = getUserSession();
        await getOrCreateUser(supabase, userId, userName ?? undefined, userEmail ?? undefined);

        const { data, error } = await supabase
          .from('tpr_tipos_receita')
          .select('tpr_id, tpr_codigo, tpr_nome, tpr_descricao, tpr_ativo')
          .eq('tpr_id', tipoId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          router.push('/cadastros/tipos-receita');
          return;
        }

        setDados(data as TipoReceita);
        setCodigo(data.tpr_codigo ?? '');
        setNome(data.tpr_nome ?? '');
        setDescricao(data.tpr_descricao ?? '');
        setAtivo(Boolean(data.tpr_ativo));
      } catch (error) {
        console.error('Erro ao carregar tipo de receita:', error);
        setFeedback('Não foi possível carregar este tipo. Tente novamente.');
      } finally {
        setCarregando(false);
      }
    };

    load();
  }, [router, tipoId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dados) return;

    if (!codigo.trim() || !nome.trim()) {
      setFeedback('Informe ao menos o código e o nome do tipo de receita.');
      return;
    }

    try {
      setSubmitting(true);
      setFeedback(null);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('tpr_tipos_receita')
        .update({
          tpr_codigo: codigo.trim(),
          tpr_nome: nome.trim(),
          tpr_descricao: descricao.trim() || null,
          tpr_ativo: ativo,
        })
        .eq('tpr_id', dados.tpr_id);

      if (error) throw error;

      router.push('/cadastros/tipos-receita');
      router.refresh();
    } catch (error: any) {
      console.error('Erro ao atualizar tipo de receita:', error);
      setFeedback(
        traduzirErroSupabase(
          error,
          'Não foi possível atualizar este tipo. Verifique os dados e tente novamente.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (carregando) {
    return (
      <>
        <Header title="Editar Tipo de Receita" />
        <div className="page-content">
          <Card>
            <Loading text="Carregando dados..." />
          </Card>
        </div>
      </>
    );
  }

  if (!dados) {
    return (
      <>
        <Header title="Editar Tipo de Receita" />
        <div className="page-content">
          <Card>
            <p className="text-sm text-gray-600">
              Tipo de receita não encontrado. Ele pode ter sido removido recentemente.
            </p>
            <div className="mt-4">
              <Button variant="secondary" onClick={() => router.push('/cadastros/tipos-receita')}>
                Voltar para listagem
              </Button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Editar Tipo de Receita"
        subtitle={`Atualize os dados do tipo ${dados.tpr_codigo}`}
      />

      <div className="page-content">
        <Card>
          <form className="space-y-6" onSubmit={handleSubmit}>
            {submitting && (
              <div className="mb-4">
                <Loading text="Salvando alterações..." />
              </div>
            )}

            {feedback && (
              <div className="rounded-md border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
                {feedback}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Código"
                value={codigo}
                onChange={(event) => setCodigo(event.target.value.toUpperCase())}
                required
              />
              <Input
                label="Nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                required
              />
            </div>

            <Textarea
              label="Descrição"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              rows={4}
            />

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(event) => setAtivo(event.target.checked)}
                className="h-4 w-4 text-primary-600 rounded focus:ring-primary-500"
              />
              Tipo ativo
            </label>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push('/cadastros/tipos-receita')}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={submitting}>
                Salvar alterações
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
