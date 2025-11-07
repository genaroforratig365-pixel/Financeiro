'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
import { traduzirErroSupabase } from '@/lib/supabaseErrors';

type Usuario = Pick<UsuarioRow, 'usr_id' | 'usr_nome' | 'usr_email' | 'usr_ativo'>;
type UsuarioAdmin = Pick<
  UsuarioRow,
  'usr_id' | 'usr_nome' | 'usr_email' | 'usr_ativo' | 'usr_identificador'
> & {
  usr_criado_em: string | null;
};

type Mensagem = {
  tipo: 'sucesso' | 'erro' | 'info';
  texto: string;
};

export default function CadastroUsuarioPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [podeGerenciar, setPodeGerenciar] = useState(false);
  const [usuariosCadastrados, setUsuariosCadastrados] = useState<UsuarioAdmin[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [criandoUsuario, setCriandoUsuario] = useState(false);
  const [novoUsuarioNome, setNovoUsuarioNome] = useState('');
  const [novoUsuarioEmail, setNovoUsuarioEmail] = useState('');
  const [mensagemAdmin, setMensagemAdmin] = useState<Mensagem | null>(null);

  const normalizarNome = (valor: string | null | undefined) =>
    (valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const ordenarUsuarios = (lista: UsuarioAdmin[]) =>
    [...lista].sort((a, b) => {
      const nomeA = (a.usr_nome ?? '').trim();
      const nomeB = (b.usr_nome ?? '').trim();

      if (nomeA && nomeB) {
        const comparacao = nomeA.localeCompare(nomeB, 'pt-BR', {
          sensitivity: 'base',
        });
        if (comparacao !== 0) {
          return comparacao;
        }
      }

      if (nomeA && !nomeB) return -1;
      if (!nomeA && nomeB) return 1;

      return a.usr_identificador.localeCompare(b.usr_identificador);
    });

  const carregarListaUsuarios = useCallback(async () => {
    try {
      setCarregandoLista(true);
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('usr_usuarios')
        .select('usr_id, usr_identificador, usr_nome, usr_email, usr_ativo, usr_criado_em')
        .order('usr_nome', { ascending: true, nullsFirst: true })
        .order('usr_criado_em', { ascending: true });

      if (error) throw error;

      setUsuariosCadastrados(
        ordenarUsuarios((data as UsuarioAdmin[] | null | undefined) ?? [])
      );
    } catch (error) {
      console.error('Erro ao carregar lista de usuários:', error);
      setMensagemAdmin({
        tipo: 'erro',
        texto: 'Não foi possível carregar a lista de usuários cadastrados.',
      });
    } finally {
      setCarregandoLista(false);
    }
  }, []);

  const gerarIdentificador = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

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

  useEffect(() => {
    if (!podeGerenciar) {
      setUsuariosCadastrados([]);
      return;
    }

    carregarListaUsuarios();
  }, [podeGerenciar, carregarListaUsuarios]);

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

  const handleCriarUsuario = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!podeGerenciar) {
      return;
    }

    const nomeNovo = novoUsuarioNome.trim();
    const emailNovo = novoUsuarioEmail.trim();

    if (!nomeNovo) {
      setMensagemAdmin({
        tipo: 'erro',
        texto: 'Informe um nome para cadastrar o novo usuário.',
      });
      return;
    }

    try {
      setCriandoUsuario(true);
      setMensagemAdmin(null);

      const identificador = gerarIdentificador();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('usr_usuarios')
        .insert({
          usr_identificador: identificador,
          usr_nome: nomeNovo,
          usr_email: emailNovo || null,
          usr_ativo: true,
        })
        .select('usr_id, usr_identificador, usr_nome, usr_email, usr_ativo, usr_criado_em')
        .single();

      if (error) throw error;
      if (!data) {
        throw new Error('O Supabase não retornou o usuário recém-criado.');
      }

      setUsuariosCadastrados((prev) => ordenarUsuarios([...prev, data]));
      setNovoUsuarioNome('');
      setNovoUsuarioEmail('');
      setMensagemAdmin({
        tipo: 'sucesso',
        texto:
          'Usuário criado com sucesso. Compartilhe o identificador para que ele possa acessar o sistema.',
      });
    } catch (error) {
      console.error('Erro ao criar novo usuário:', error);
      setMensagemAdmin({
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível cadastrar o novo usuário. Verifique as permissões e tente novamente.',
        ),
      });
    } finally {
      setCriandoUsuario(false);
    }
  };

  const handleLimparNovoUsuario = () => {
    setNovoUsuarioNome('');
    setNovoUsuarioEmail('');
    setMensagemAdmin(null);
  };

  return (
    <>
      <Header
        title="Dados do Usuário"
        subtitle="Defina o nome e o e-mail utilizados nas notificações e relatórios"
      />

      <div className="page-content space-y-6">
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

        {podeGerenciar && (
          <Card
            title="Gerenciamento de usuários"
            subtitle="Genaro pode registrar novos usuários sem sair do navegador"
          >
            <div className="space-y-6">
              {mensagemAdmin && (
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    mensagemAdmin.tipo === 'sucesso'
                      ? 'border-success-200 bg-success-50 text-success-700'
                      : mensagemAdmin.tipo === 'erro'
                      ? 'border-error-200 bg-error-50 text-error-700'
                      : 'border-primary-200 bg-primary-50 text-primary-800'
                  }`}
                >
                  {mensagemAdmin.texto}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleCriarUsuario}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Nome do novo usuário"
                    placeholder="Ex.: Financeiro Loja A"
                    value={novoUsuarioNome}
                    onChange={(event) => setNovoUsuarioNome(event.target.value)}
                    required
                  />

                  <Input
                    label="E-mail (opcional)"
                    type="email"
                    placeholder="contato@empresa.com"
                    value={novoUsuarioEmail}
                    onChange={(event) => setNovoUsuarioEmail(event.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleLimparNovoUsuario}
                    disabled={criandoUsuario}
                  >
                    Limpar
                  </Button>
                  <Button type="submit" variant="primary" loading={criandoUsuario}>
                    Criar usuário
                  </Button>
                </div>
              </form>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Usuários cadastrados ({usuariosCadastrados.length})
                </h3>

                {carregandoLista ? (
                  <Loading text="Carregando lista de usuários..." />
                ) : usuariosCadastrados.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Nenhum usuário adicional cadastrado ainda. Utilize o formulário acima para adicionar novos acessos.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {usuariosCadastrados.map((item) => (
                      <div
                        key={item.usr_id}
                        className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <span className="font-medium text-gray-900">
                            {item.usr_nome?.trim() || 'Usuário sem nome definido'}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              item.usr_ativo ? 'text-success-700' : 'text-gray-500'
                            }`}
                          >
                            {item.usr_ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        {item.usr_email && (
                          <p className="text-xs text-gray-500 mt-1">E-mail: {item.usr_email}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1 break-all">
                          Identificador: {item.usr_identificador}
                        </p>
                        {item.usr_criado_em && (
                          <p className="text-xs text-gray-400 mt-1">
                            Criado em {new Date(item.usr_criado_em).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
