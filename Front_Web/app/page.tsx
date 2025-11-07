'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Card, Input, Loading } from '@/components/ui';
import { getOrCreateUser, getSupabaseClient } from '@/lib/supabaseClient';
import {
  clearUserEmail,
  clearUserName,
  getStoredUserId,
  getUserSession,
  hasActiveSession,
  setUserEmail,
  setUserId,
  setUserName,
} from '@/lib/userSession';

interface UsuarioOption {
  usr_id: string;
  usr_identificador: string;
  usr_nome: string | null;
  usr_email: string | null;
  usr_ativo: boolean;
}

interface Mensagem {
  tipo: 'sucesso' | 'erro' | 'info';
  texto: string;
}

const formatarNome = (usuario: UsuarioOption) =>
  usuario.usr_nome?.trim() || `Usuário ${usuario.usr_identificador.slice(0, 8)}`;

const HomePage: React.FC = () => {
  const router = useRouter();

  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [filtro, setFiltro] = useState('');
  const [selecionado, setSelecionado] = useState('');
  const [loading, setLoading] = useState(true);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [sessionAtual, setSessionAtual] = useState<ReturnType<typeof getUserSession> | null>(null);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    const carregarUsuarios = async () => {
      try {
        setLoading(true);
        const supabase = getSupabaseClient({ includeSessionHeader: false });
        const { data, error } = await supabase
          .from('usr_usuarios')
          .select('usr_id, usr_identificador, usr_nome, usr_email, usr_ativo')
          .eq('usr_ativo', true)
          .order('usr_nome', { ascending: true, nullsFirst: true });

        if (error) throw error;
        setUsuarios(((data as UsuarioOption[] | null | undefined) ?? []).filter(Boolean));

        if (hasActiveSession()) {
          setSessionAtual(getUserSession());
        }
      } catch (error) {
        console.error('Erro ao carregar usuários disponíveis:', error);
        setMensagem({
          tipo: 'erro',
          texto:
            'Não foi possível carregar os usuários cadastrados. Tente novamente em instantes.',
        });
      } finally {
        setLoading(false);
      }
    };

    carregarUsuarios();
  }, []);

  useEffect(() => {
    if (!sessionAtual) {
      return;
    }

    // Se já existe uma sessão ativa, garantir que o identificador esteja sincronizado no Supabase
    const garantirCadastro = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await getOrCreateUser(
          supabase,
          sessionAtual.userId,
          sessionAtual.userName ?? undefined,
          sessionAtual.userEmail ?? undefined,
        );

        if (!data) {
          setMensagem({
            tipo: 'info',
            texto:
              'Sessão identificada, mas o cadastro não pôde ser carregado automaticamente. '
              + 'Selecione um usuário abaixo para continuar.',
          });
          return;
        }

        if (!selecionado) {
          setSelecionado(data.usr_identificador);
        }
      } catch (error) {
        console.warn('Não foi possível sincronizar a sessão atual.', error);
      }
    };

    garantirCadastro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAtual?.userId]);

  const usuariosFiltrados = usuarios.filter((usuario) => {
    if (!filtro.trim()) {
      return true;
    }

    const filtroLower = filtro.trim().toLowerCase();
    return (
      formatarNome(usuario).toLowerCase().includes(filtroLower) ||
      (usuario.usr_email ?? '').toLowerCase().includes(filtroLower)
    );
  });

  const selecionarUsuario = async () => {
    const escolhido = usuarios.find(
      (usuario) => usuario.usr_identificador === selecionado,
    );

    if (!escolhido) {
      setMensagem({
        tipo: 'erro',
        texto: 'Escolha um usuário válido antes de continuar.',
      });
      return;
    }

    try {
      setAplicando(true);
      setMensagem(null);

      setUserId(escolhido.usr_identificador);

      if (escolhido.usr_nome) {
        setUserName(escolhido.usr_nome);
      } else {
        clearUserName();
      }

      if (escolhido.usr_email) {
        setUserEmail(escolhido.usr_email);
      } else {
        clearUserEmail();
      }

      const snapshot = getUserSession();
      setSessionAtual(snapshot);
      setMensagem({
        tipo: 'sucesso',
        texto: `Sessão ativada para ${snapshot.displayName}. Escolha um módulo para continuar.`,
      });

      setTimeout(() => {
        router.push('/dashboard');
      }, 500);
    } catch (error) {
      console.error('Erro ao definir sessão do usuário:', error);
      setMensagem({
        tipo: 'erro',
        texto: 'Não foi possível ativar este usuário. Tente novamente.',
      });
    } finally {
      setAplicando(false);
    }
  };

  const usuarioAtualNome = sessionAtual?.displayName ?? null;
  const identificadorAtual = getStoredUserId();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-8 py-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Seleção de Operador</h1>
            <p className="mt-1 text-sm text-gray-600">
              Escolha quem irá registrar os dados do último dia útil. Todos os cadastros ficam disponíveis para qualquer operador.
            </p>
          </div>

          {sessionAtual && (
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Ir para Dashboard
            </Button>
          )}
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pb-12">
          <Card className="w-full max-w-xl border-primary-200/70 shadow-xl shadow-primary-200/30 backdrop-blur-sm">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-2xl font-semibold text-gray-900">
                  Selecione quem irá operar hoje
                </h1>
                <p className="text-sm text-gray-500">
                  Todos os usuários ativos estão listados abaixo. Basta escolher para abrir a movimentação do dia.
                </p>
              </div>

              {mensagem && (
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    mensagem.tipo === 'sucesso'
                      ? 'border-success-200 bg-success-50 text-success-700'
                      : mensagem.tipo === 'erro'
                      ? 'border-error-200 bg-error-50 text-error-700'
                      : 'border-primary-200 bg-primary-50 text-primary-800'
                  }`}
                >
                  {mensagem.texto}
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loading size="lg" text="Carregando usuários cadastrados..." />
                </div>
              ) : (
                <div className="space-y-5">
                  <Input
                    label="Buscar usuário"
                    placeholder="Filtrar por nome ou e-mail"
                    value={filtro}
                    onChange={(event) => setFiltro(event.target.value)}
                    fullWidth
                  />

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700" htmlFor="usuario-selecionado">
                      Usuário selecionado
                    </label>
                    <select
                      id="usuario-selecionado"
                      className="w-full rounded-md border border-gray-200 bg-white/80 px-3 py-2 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={selecionado}
                      onChange={(event) => setSelecionado(event.target.value)}
                    >
                      <option value="">Selecione um usuário ativo...</option>
                      {usuariosFiltrados.map((usuario) => (
                        <option key={usuario.usr_id} value={usuario.usr_identificador}>
                          {formatarNome(usuario)}
                          {usuario.usr_email ? ` • ${usuario.usr_email}` : ''}
                        </option>
                      ))}
                    </select>
                    {usuariosFiltrados.length === 0 && (
                      <p className="text-sm text-gray-500">
                        Nenhum usuário corresponde ao filtro informado.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-dashed border-primary-200 bg-primary-50/40 px-4 py-3 text-sm text-primary-900">
                    {usuarioAtualNome ? (
                      <>
                        Operando como <strong>{usuarioAtualNome}</strong>.
                        <br />
                        {identificadorAtual && (
                          <span className="block text-xs text-gray-500">
                            Identificador local:{' '}
                            <code className="font-mono text-xs">{identificadorAtual}</code>
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        Nenhum usuário está ativo neste navegador.
                        <br />
                        Escolha um operador para liberar os módulos do sistema.
                        {identificadorAtual && (
                          <span className="mt-1 block text-xs text-gray-500">
                            Identificador local:{' '}
                            <code className="font-mono text-xs">{identificadorAtual}</code>
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white/70">
                    <ul className="divide-y divide-gray-100 text-sm">
                      {usuarios.map((usuario) => {
                        const ativo = usuario.usr_identificador === selecionado;
                        return (
                          <li key={usuario.usr_id} className={ativo ? 'bg-primary-50/70' : ''}>
                            <button
                              type="button"
                              className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-primary-50/80 ${ativo ? 'text-primary-700' : 'text-gray-700'}`}
                              onClick={() => setSelecionado(usuario.usr_identificador)}
                            >
                              <div>
                                <p className="font-medium">
                                  {formatarNome(usuario)}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Identificador: {usuario.usr_identificador}
                                </p>
                                {usuario.usr_email && (
                                  <p className="text-xs text-gray-500">{usuario.usr_email}</p>
                                )}
                              </div>
                              <span className="text-xs uppercase tracking-wide text-gray-400">
                                {ativo ? 'Selecionado' : 'Escolher'}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-500">
                      Precisa cadastrar um novo usuário? Abra Cadastros &gt; Usuários.
                    </p>
                    <Button
                      variant="primary"
                      onClick={selecionarUsuario}
                      disabled={!selecionado}
                      loading={aplicando}
                    >
                      Entrar com este usuário
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default HomePage;
