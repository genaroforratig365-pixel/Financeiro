'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading } from '@/components/ui';
import { evaluateMath, formatCurrency } from '@/lib/mathParser';
import {
  getOrCreateUser,
  getSupabaseClient,
  type UsuarioRow,
} from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';

interface ContaOption {
  id: number;
  nome: string;
}

interface TipoOption {
  id: number;
  nome: string;
}

type FormEntry = {
  tipoId: number | '';
  data: string;
  valor: string;
};

type FormState = Record<number, FormEntry>;

type Mensagem = { tipo: 'sucesso' | 'erro' | 'info'; texto: string };

type CobrancaHistorico = {
  id: number;
  conta: string;
  tipo: string;
  data: string;
  valor: number;
};

const dataPadrao = new Date().toISOString().split('T')[0];

const avaliarValor = (entrada: string): number | null => {
  if (!entrada) {
    return null;
  }

  return evaluateMath(entrada);
};

export default function LancamentoCobrancaPage() {
  const [contas, setContas] = useState<ContaOption[]>([]);
  const [tipos, setTipos] = useState<TipoOption[]>([]);
  const [formulario, setFormulario] = useState<FormState>({});
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [historico, setHistorico] = useState<CobrancaHistorico[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const totalCalculado = useMemo(() => {
    return contas.reduce((acc, conta) => {
      const valor = avaliarValor(formulario[conta.id]?.valor ?? '');
      if (valor && valor > 0) {
        return acc + valor;
      }
      return acc;
    }, 0);
  }, [contas, formulario]);

  const carregarHistorico = useCallback(
    async (usuarioAtual: UsuarioRow) => {
      try {
        setCarregandoHistorico(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('cob_cobrancas')
          .select(
            'cob_id, cob_data, cob_valor, ctr_contas_receita(ctr_nome), tpr_tipos_receita(tpr_nome)'
          )
          .eq('cob_usr_id', usuarioAtual.usr_id)
          .order('cob_data', { ascending: false })
          .order('cob_criado_em', { ascending: false })
          .limit(12);

        if (error) throw error;

        const itens = (data ?? []).map((item) => ({
          id: Number(item.cob_id),
          data: String(item.cob_data ?? ''),
          valor: Number(item.cob_valor ?? 0),
          conta:
            (Array.isArray(item.ctr_contas_receita)
              ? item.ctr_contas_receita[0]?.ctr_nome
              : (item.ctr_contas_receita as any)?.ctr_nome) ?? 'Conta não informada',
          tipo:
            (Array.isArray(item.tpr_tipos_receita)
              ? item.tpr_tipos_receita[0]?.tpr_nome
              : (item.tpr_tipos_receita as any)?.tpr_nome) ?? 'Tipo não informado',
        }));

        setHistorico(itens);
      } catch (error) {
        console.error('Erro ao carregar histórico de cobranças:', error);
        setHistorico([]);
      } finally {
        setCarregandoHistorico(false);
      }
    },
    []
  );

  useEffect(() => {
    const carregarDados = async () => {
      try {
        setCarregando(true);
        const supabase = getSupabaseClient();
        const { userId, userName, userEmail } = getUserSession();
        const { data: usuarioEncontrado, error: usuarioErro } = await getOrCreateUser(
          supabase,
          userId,
          userName ?? undefined,
          userEmail ?? undefined
        );

        if (usuarioErro) throw usuarioErro;
        if (!usuarioEncontrado) {
          setMensagem({
            tipo: 'info',
            texto:
              'Selecione um operador válido antes de registrar cobranças. Retorne à tela inicial e escolha um usuário.',
          });
          return;
        }

        setUsuario(usuarioEncontrado);

        const [contasRes, tiposRes] = await Promise.all([
          supabase
            .from('ctr_contas_receita')
            .select('ctr_id, ctr_nome')
            .eq('ctr_ativo', true)
            .order('ctr_nome', { ascending: true }),
          supabase
            .from('tpr_tipos_receita')
            .select('tpr_id, tpr_nome')
            .eq('tpr_ativo', true)
            .order('tpr_nome', { ascending: true }),
        ]);

        if (contasRes.error) throw contasRes.error;
        if (tiposRes.error) throw tiposRes.error;

        const contasAtivas = (contasRes.data ?? []).map((item) => ({
          id: Number(item.ctr_id),
          nome: item.ctr_nome ?? 'Conta sem nome',
        }));
        const tiposAtivos = (tiposRes.data ?? []).map((item) => ({
          id: Number(item.tpr_id),
          nome: item.tpr_nome ?? 'Tipo sem nome',
        }));

        setContas(contasAtivas);
        setTipos(tiposAtivos);
        setFormulario(() => {
          const inicial: FormState = {};
          contasAtivas.forEach((conta) => {
            inicial[conta.id] = {
              tipoId: '',
              data: dataPadrao,
              valor: '',
            };
          });
          return inicial;
        });

        setMensagem(null);
        await carregarHistorico(usuarioEncontrado);
      } catch (error) {
        console.error('Erro ao carregar tela de cobranças:', error);
        setMensagem({
          tipo: 'erro',
          texto: 'Não foi possível carregar os dados iniciais de cobrança.',
        });
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [carregarHistorico]);

  const atualizarFormulario = (contaId: number, dados: Partial<FormEntry>) => {
    setFormulario((prev) => ({
      ...prev,
      [contaId]: {
        ...prev[contaId],
        ...dados,
      },
    }));
  };

  const handleRegistrar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) {
      setMensagem({
        tipo: 'erro',
        texto: 'Selecione um usuário antes de registrar cobranças.',
      });
      return;
    }

    const registros = contas
      .map((conta) => {
        const entrada = formulario[conta.id];
        if (!entrada) return null;

        const valorCalculado = avaliarValor(entrada.valor ?? '');
        if (!valorCalculado || valorCalculado <= 0) {
          return null;
        }

        if (!entrada.tipoId) {
          return null;
        }

        const dataRegistro = entrada.data || dataPadrao;

        return {
          contaId: conta.id,
          cob_ctr_id: conta.id,
          cob_tpr_id: Number(entrada.tipoId),
          cob_usr_id: usuario.usr_id,
          cob_data: dataRegistro,
          cob_valor: valorCalculado,
        };
      })
      .filter(Boolean) as {
      contaId: number;
      cob_ctr_id: number;
      cob_tpr_id: number;
      cob_usr_id: string;
      cob_data: string;
      cob_valor: number;
    }[];

    if (registros.length === 0) {
      setMensagem({
        tipo: 'info',
        texto: 'Informe valor, data e tipo de receita para pelo menos uma conta antes de salvar.',
      });
      return;
    }

    try {
      setRegistrando(true);
      setMensagem(null);
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('cob_cobrancas').insert(
        registros.map(({ contaId, ...resto }) => resto)
      );

      if (error) throw error;

      setFormulario((prev) => {
        const next = { ...prev };
        registros.forEach((registro) => {
          next[registro.contaId] = {
            ...next[registro.contaId],
            valor: '',
          };
        });
        return next;
      });

      setMensagem({
        tipo: 'sucesso',
        texto:
          registros.length === 1
            ? 'Cobrança registrada com sucesso.'
            : `${registros.length} cobranças registradas com sucesso.`,
      });

      await carregarHistorico(usuario);
    } catch (error) {
      console.error('Erro ao registrar cobranças:', error);
      setMensagem({
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível registrar as cobranças. Verifique os dados e tente novamente.'
        ),
      });
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <>
      <Header
        title="Lançamento de Cobrança"
        subtitle="Registre cobranças por conta de receita vinculando um tipo e data específicos"
      />

      <div className="page-content space-y-6">
        <Card>
          <div className="space-y-6">
            {carregando ? (
              <div className="py-12">
                <Loading text="Carregando contas e tipos de receita..." />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Registrar cobranças</h2>
                    <p className="text-sm text-gray-600">
                      Preencha os valores para as contas desejadas. É possível usar expressões matemáticas (ex.: 10+20-5).
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary-100 bg-primary-50/50 px-4 py-2 text-sm text-primary-700">
                    Total a registrar:{' '}
                    <strong>{formatCurrency(totalCalculado)}</strong>
                  </div>
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

                <form className="space-y-6" onSubmit={handleRegistrar}>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {contas.map((conta) => {
                      const entrada = formulario[conta.id];
                      const valorCalculado = avaliarValor(entrada?.valor ?? '');
                      return (
                        <div key={conta.id} className="rounded-lg border border-gray-200 bg-white/70 p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-base font-semibold text-gray-900">{conta.nome}</h3>
                              <p className="text-xs text-gray-500">Conta #{conta.id}</p>
                            </div>
                            {valorCalculado !== null && valorCalculado > 0 && (
                              <span className="text-sm font-medium text-primary-600">
                                {formatCurrency(valorCalculado)}
                              </span>
                            )}
                          </div>

                          <div className="mt-4 space-y-3">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Tipo de receita
                              <select
                                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                value={entrada?.tipoId ?? ''}
                                onChange={(event) =>
                                  atualizarFormulario(conta.id, {
                                    tipoId: event.target.value ? Number(event.target.value) : '',
                                  })
                                }
                              >
                                <option value="">Selecione um tipo...</option>
                                {tipos.map((tipo) => (
                                  <option key={tipo.id} value={tipo.id}>
                                    {tipo.nome}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Data da cobrança
                                <input
                                  type="date"
                                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  value={entrada?.data ?? dataPadrao}
                                  onChange={(event) =>
                                    atualizarFormulario(conta.id, { data: event.target.value })
                                  }
                                />
                              </label>

                              <Input
                                label="Valor / Expressão"
                                placeholder="Ex.: 1500 ou 1000+500"
                                value={entrada?.valor ?? ''}
                                onChange={(event) =>
                                  atualizarFormulario(conta.id, { valor: event.target.value })
                                }
                                helperText={
                                  valorCalculado !== null
                                    ? `Resultado: ${formatCurrency(valorCalculado)}`
                                    : 'Informe um valor positivo ou expressão válida.'
                                }
                                fullWidth
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-500">
                      Dica: utilize expressões para agilizar o preenchimento (ex.: 10*3 ou 1000+250).
                    </p>
                    <Button type="submit" variant="primary" loading={registrando}>
                      Registrar cobranças selecionadas
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </Card>

        <Card title="Histórico recente">
          {carregandoHistorico ? (
            <div className="py-8">
              <Loading text="Buscando cobranças anteriores..." />
            </div>
          ) : historico.length === 0 ? (
            <p className="text-sm text-gray-600">
              Nenhuma cobrança foi registrada ainda para este usuário.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Data</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Conta</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Tipo</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white/80">
                  {historico.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-gray-700">{item.data}</td>
                      <td className="px-4 py-2 text-gray-700">{item.conta}</td>
                      <td className="px-4 py-2 text-gray-700">{item.tipo}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">
                        {formatCurrency(item.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
