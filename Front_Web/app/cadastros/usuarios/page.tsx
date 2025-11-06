'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/layout';
import { Card, Button, Input, Loading, Textarea } from '@/components/ui';
import {
  getUserSession,
  setUserEmail,
  setUserName,
  clearUserEmail,
  clearUserName,
} from '@/lib/userSession';
import {
  getSupabaseClient,
  getOrCreateUser,
  type UsuarioRow,
} from '@/lib/supabaseClient';

type Usuario = Pick<UsuarioRow, 'usr_id' | 'usr_nome' | 'usr_email' | 'usr_ativo'>;

export default function CadastroUsuarioPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const loadUsuario = async () => {
      try {
        setLoading(true);
        const supabase = getSupabaseClient();
        const { userId, userName, userEmail } = getUserSession();
        const { data, error } = await getOrCreateUser(
          supabase,
          userId,
          userName ?? undefined,
          userEmail ?? undefined,
        );

        if (error) throw error;
        if (!data) {
          setFeedback('Não foi possível carregar os dados do usuário.');
          return;
        }

        setUsuario({
          usr_id: data.usr_id,
          usr_nome: data.usr_nome,
          usr_email: data.usr_email ?? null,
          usr_ativo: data.usr_ativo,
        });
        setNome(data.usr_nome ?? '');
        setEmail(data.usr_email ?? '');
      } catch (error) {
        console.error('Erro ao carregar usuário:', error);
        setFeedback('Não foi possível carregar os dados do usuário.');
      } finally {
        setLoading(false);
      }
    };

    loadUsuario();
  }, []);

  const handleSave = async () => {
    if (!usuario) return;

    try {
      setSaving(true);
      setFeedback(null);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('usr_usuarios')
        .update({
          usr_nome: nome.trim() || null,
          usr_email: email.trim() || null,
        })
        .eq('usr_id', usuario.usr_id);

      if (error) {
        console.error('Erro ao salvar usuário:', error);
        const isPermissionDenied = error.message
          ?.toLowerCase()
          .includes('permission denied');
        setFeedback(
          isPermissionDenied
            ? 'Permissão negada para atualizar seus dados. Recarregue a página após aplicar as permissões no Supabase.'
            : 'Não foi possível salvar os dados. Verifique sua conexão e tente novamente.'
        );
        return;
      }

      if (nome.trim()) {
        setUserName(nome.trim());
      } else {
        clearUserName();
      }

      if (email.trim()) {
        setUserEmail(email.trim());
      } else {
        clearUserEmail();
      }

      setUsuario((prev) =>
        prev
          ? {
              ...prev,
              usr_nome: nome.trim() || null,
              usr_email: email.trim() || null,
            }
          : prev
      );

      setFeedback('Informações atualizadas com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      setFeedback('Não foi possível salvar os dados. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header
        title="Dados do Usuário"
        subtitle="Defina o nome e o e-mail utilizados nas notificações e relatórios"
      />

      <div className="page-content">
        <Card>
          {loading ? (
            <Loading text="Carregando dados do usuário..." />
          ) : (
            <div className="space-y-6">
              {feedback && (
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    feedback.includes('sucesso')
                      ? 'border-success-200 bg-success-50 text-success-700'
                      : 'border-error-200 bg-error-50 text-error-700'
                  }`}
                >
                  {feedback}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nome ou Apelido"
                  placeholder="Como devemos chamar você?"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  helperText="Exibido no topo da aplicação e nos relatórios enviados."
                />

                <Input
                  label="E-mail para notificações"
                  type="email"
                  placeholder="nome@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  helperText="Utilizado para envio de relatórios diários e alertas."
                />
              </div>

              <Textarea
                label="Observações"
                placeholder="Anote preferências ou regras de envio. (Opcional)"
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                rows={3}
                helperText="Este campo é local e não é enviado ao servidor."
              />

              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNome(usuario?.usr_nome ?? '');
                    setEmail(usuario?.usr_email ?? '');
                    setObservacoes('');
                    setFeedback(null);
                  }}
                  disabled={saving}
                >
                  Desfazer alterações
                </Button>
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  Salvar dados
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
