'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Loading } from '@/components/ui';
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
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen flex-col">
        <header className="bg-[#C1272D] px-8 py-8 shadow-lg">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-3xl font-bold text-white">Germani Alimentos</h1>
            <p className="mt-2 text-sm text-white/90">
              Sistema de Gestão Financeira
            </p>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <div className="rounded-lg border-2 border-[#C1272D]/20 bg-white p-8 shadow-2xl">
              <div className="space-y-6">
              <div className="space-y-3 text-center">
                <div className="mx-auto h-16 w-16 rounded-full bg-[#C1272D] flex items-center justify-center">
                  <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Selecione o Operador
                </h2>
                <p className="text-sm text-gray-600">
                  Escolha quem irá registrar as movimentações
                </p>
              </div>

              {mensagem && (
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    mensagem.tipo === 'sucesso'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : mensagem.tipo === 'erro'
                      ? 'border-[#C1272D]/30 bg-red-50 text-[#C1272D]'
                      : 'border-gray-200 bg-gray-50 text-gray-700'
                  }`}
                >
                  {mensagem.texto}
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loading size="lg" text="Carregando..." />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700" htmlFor="usuario-selecionado">
                      Usuário
                    </label>
                    <select
                      id="usuario-selecionado"
                      className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-[#C1272D] focus:outline-none focus:ring-2 focus:ring-[#C1272D]/20"
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
                  </div>

                  {usuarioAtualNome && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      <p>Operador atual: <strong className="text-[#C1272D]">{usuarioAtualNome}</strong></p>
                    </div>
                  )}

                  <Button
                    variant="primary"
                    onClick={selecionarUsuario}
                    disabled={!selecionado}
                    loading={aplicando}
                    fullWidth
                    className="!bg-[#C1272D] hover:!bg-[#A01F24] !text-white !py-3 !text-base !font-semibold"
                  >
                    Entrar
                  </Button>

                  {sessionAtual && (
                    <button
                      type="button"
                      onClick={() => router.push('/dashboard')}
                      className="w-full text-center text-sm text-gray-600 hover:text-[#C1272D] transition"
                    >
                      Ir para Dashboard →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        </main>
      </div>
    </div>
  );
};

export default HomePage;
