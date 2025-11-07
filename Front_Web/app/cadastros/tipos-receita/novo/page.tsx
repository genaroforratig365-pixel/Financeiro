'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading, Textarea } from '@/components/ui';
import { getOrCreateUser, getSupabaseClient } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';

export default function NovoTipoReceitaPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!codigo.trim() || !nome.trim()) {
      setFeedback('Informe ao menos o código e o nome do tipo de receita.');
      return;
    }

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

      const { error } = await supabase.from('tpr_tipos_receita').insert({
        tpr_codigo: codigo.trim(),
        tpr_nome: nome.trim(),
        tpr_descricao: descricao.trim() || null,
        tpr_ativo: ativo,
        tpr_usr_id: user.usr_id,
      });

      if (error) throw error;

      router.push('/cadastros/tipos-receita');
      router.refresh();
    } catch (error: any) {
      console.error('Erro ao salvar tipo de receita:', error);
      setFeedback(
        traduzirErroSupabase(
          error,
          'Não foi possível salvar o tipo de receita. Verifique os dados e tente novamente.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header
        title="Novo Tipo de Receita"
        subtitle="Cadastre um tipo para organizar cobranças e relatórios"
      />

      <div className="page-content">
        <Card>
          <form className="space-y-6" onSubmit={handleSubmit}>
            {submitting && (
              <div className="mb-4">
                <Loading text="Salvando tipo de receita..." />
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
                placeholder="Ex.: COB"
                required
              />
              <Input
                label="Nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Ex.: Cobranças recorrentes"
                required
              />
            </div>

            <Textarea
              label="Descrição"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              placeholder="Detalhes opcionais sobre o uso deste tipo"
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
                Salvar tipo
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
