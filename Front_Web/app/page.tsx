'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Header } from '@/components/layout';
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
        texto: `Sessão atualizada para ${snapshot.displayName}. Redirecionando...`,
      });

      setTimeout(() => {
        router.push('/saldo-diario');
      }, 400);
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
    <>
      <Header
        title="Bem-vindo ao Financeiro"
        subtitle="Escolha com qual usuário deseja trabalhar hoje"
        actions={
          sessionAtual && (
            <Button variant="secondary" onClick={() => router.push('/saldo-diario')}>
              Ir para Saldo Diário
            </Button>
          )
        }
      />

      <div className="page-content max-w-4xl mx-auto space-y-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loading size="lg" text="Carregando usuários cadastrados..." />
          </div>
        ) : (
          <Card>
            <div className="space-y-6">
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

              <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                <p className="text-sm text-gray-600">
                  {usuarioAtualNome ? (
                    <>
                      Você está navegando como <strong>{usuarioAtualNome}</strong>.
                      <br />
                      Identificador local: <code className="font-mono text-xs">{identificadorAtual}</code>
                    </>
                  ) : (
                    'Nenhum usuário está ativo neste navegador. Selecione um para começar.'
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Buscar usuário"
                  placeholder="Filtrar por nome ou e-mail"
                  value={filtro}
                  onChange={(event) => setFiltro(event.target.value)}
                  fullWidth
                />

                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usuário selecionado
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                    <p className="mt-1 text-sm text-gray-500">
                      Nenhum usuário corresponde ao filtro informado.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <p className="text-sm text-gray-500">
                  Precisa criar um novo usuário? Acesse o menu Cadastros &gt; Usuários.
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

              <div className="border-t border-gray-200 pt-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">
                  Usuários disponíveis ({usuarios.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {usuarios.map((usuario) => (
                    <div
                      key={usuario.usr_id}
                      className={`rounded-lg border p-3 text-sm ${
                        usuario.usr_identificador === selecionado
                          ? 'border-primary-400 bg-primary-50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <strong className="text-gray-900">{formatarNome(usuario)}</strong>
                        <button
                          type="button"
                          className="text-primary-600 text-xs font-medium"
                          onClick={() => setSelecionado(usuario.usr_identificador)}
                        >
                          Usar
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 break-all">
                        Identificador: {usuario.usr_identificador}
                      </p>
                      {usuario.usr_email && (
                        <p className="text-xs text-gray-500 mt-1">{usuario.usr_email}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
};

export default HomePage;
