'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading, Table } from '@/components/ui';
import { evaluateMath, formatCurrency } from '@/lib/mathParser';
import {
  getOrCreateUser,
  getSupabaseClient,
  type UsuarioRow,
} from '@/lib/supabaseClient';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';
import { getUserSession } from '@/lib/userSession';

const dataPadrao = new Date().toISOString().split('T')[0];

type MaybeArray<T> = T | T[] | null | undefined;

type TipoReceitaRow = {
  tpr_id?: unknown;
  tpr_nome?: unknown;
};

type ContaTipoVinculoRow = {
  ctp_id?: unknown;
  tpr_tipos_receita?: MaybeArray<TipoReceitaRow | null>;
};

type ContaBancoVinculoRow = {
  bcr_id?: unknown;
  ctr_contas_receita?: MaybeArray<{
    ctr_id?: unknown;
    ctr_nome?: unknown;
    ctp_conta_tipo_receita?: MaybeArray<ContaTipoVinculoRow | null>;
  } | null>;
};

type BancoRow = {
  ban_id?: unknown;
  ban_nome?: unknown;
  bcr_banco_conta?: MaybeArray<ContaBancoVinculoRow | null>;
};

type Tipo = { id: number; nome: string };
type Conta = { id: number; nome: string; tipos: Tipo[] };
type Banco = { id: number; nome: string; contas: Conta[] };

type FormEntry = {
  valor: string;
  data: string;
};

type FormState = Record<number, Record<number, Record<number, FormEntry>>>;

type Mensagem = { tipo: 'sucesso' | 'erro' | 'info'; texto: string };

type HistoricoItem = {
  id: number;
  data: string;
  valor: number;
  banco: string;
  conta: string;
  tipo: string;
};

type HistoricoRow = {
  cob_id?: unknown;
  cob_data?: unknown;
  cob_valor?: unknown;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_nome?: unknown } | null>;
};

const normalizeRelation = <T,>(value: MaybeArray<T>): Exclude<T, null | undefined>[] => {
  if (!value) {
    return [];
  }

  const arrayValue = Array.isArray(value) ? value : [value];
  return arrayValue.filter((item): item is Exclude<T, null | undefined> => item != null);
};

const toNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return null;
};

const toString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
};

const avaliarValor = (valor: string | undefined): number | null => {
  if (!valor) {
    return null;
  }

  return evaluateMath(valor);
};

const sincronizarFormulario = (bancos: Banco[], anterior: FormState): FormState => {
  const next: FormState = {};

  bancos.forEach((banco) => {
    const anteriorBanco = anterior[banco.id] ?? {};
    next[banco.id] = {};

    banco.contas.forEach((conta) => {
      const anteriorConta = anteriorBanco[conta.id] ?? {};
      next[banco.id][conta.id] = {};

      conta.tipos.forEach((tipo) => {
        const anteriorTipo = anteriorConta[tipo.id];
        next[banco.id][conta.id][tipo.id] = {
          data: anteriorTipo?.data ?? dataPadrao,
          valor: anteriorTipo?.valor ?? '',
        };
      });
    });
  });

  return next;
};

const mapBancoRows = (rows: MaybeArray<BancoRow | null>, fallbackTipos: Tipo[]): Banco[] =>
  normalizeRelation(rows).map((row) => {
    const contasRelacionadas = normalizeRelation(row.bcr_banco_conta ?? null);

    const contas = contasRelacionadas.map((relacao) => {
      const contaRow = normalizeRelation(relacao.ctr_contas_receita ?? null)[0];
      if (!contaRow) {
        return null;
      }

      const tiposRelacionados = normalizeRelation(contaRow.ctp_conta_tipo_receita ?? null)
        .map((tipoVinculo) => {
          const tipoRow = normalizeRelation(tipoVinculo.tpr_tipos_receita ?? null)[0];
          if (!tipoRow) {
            return null;
          }
          return {
            id: toNumber(tipoRow.tpr_id) ?? 0,
            nome: toString(tipoRow.tpr_nome, 'Tipo sem nome'),
          };
        })
        .filter((tipo): tipo is Tipo => Boolean(tipo && tipo.id));

      const tipos = tiposRelacionados.length > 0 ? tiposRelacionados : fallbackTipos;

      return {
        id: toNumber(contaRow.ctr_id) ?? 0,
        nome: toString(contaRow.ctr_nome, 'Conta sem nome'),
        tipos,
      };
    });

    return {
      id: toNumber(row.ban_id) ?? 0,
      nome: toString(row.ban_nome, 'Banco sem nome'),
      contas: contas.filter((conta): conta is Conta => Boolean(conta && conta.id && conta.tipos.length > 0)),
    };
  });

const mapHistorico = (rows: MaybeArray<HistoricoRow | null>): HistoricoItem[] =>
  normalizeRelation(rows).map((row) => {
    const banco = normalizeRelation(row.ban_bancos ?? null)[0];
    const conta = normalizeRelation(row.ctr_contas_receita ?? null)[0];
    const tipo = normalizeRelation(row.tpr_tipos_receita ?? null)[0];

    return {
      id: toNumber(row.cob_id) ?? 0,
      data: toString(row.cob_data),
      valor: toNumber(row.cob_valor) ?? 0,
      banco: banco ? toString(banco.ban_nome, 'Banco não informado') : 'Banco não informado',
      conta: conta ? toString(conta.ctr_nome, 'Conta não informada') : 'Conta não informada',
      tipo: tipo ? toString(tipo.tpr_nome, 'Tipo não informado') : 'Tipo não informado',
    };
  });

export default function LancamentoCobrancaPage() {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [formulario, setFormulario] = useState<FormState>({});
  const [bancoSelecionado, setBancoSelecionado] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);

  const carregarHistorico = useCallback(
    async (usuarioAtual: UsuarioRow) => {
      try {
        setCarregandoHistorico(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('cob_cobrancas')
          .select(
            'cob_id, cob_data, cob_valor, ban_bancos(ban_nome), ctr_contas_receita(ctr_nome), tpr_tipos_receita(tpr_nome)'
          )
          .eq('cob_usr_id', usuarioAtual.usr_id)
          .order('cob_data', { ascending: false })
          .order('cob_criado_em', { ascending: false })
          .limit(30);

        if (error) throw error;
        setHistorico(mapHistorico(data ?? null));
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

        if (usuarioErro) {
          throw usuarioErro;
        }

        if (!usuarioEncontrado) {
          setMensagem({
            tipo: 'info',
            texto: 'Selecione um operador válido antes de registrar cobranças. Retorne à tela inicial e escolha um usuário.',
          });
          return;
        }

        setUsuario(usuarioEncontrado);

        const [tiposRes, bancosRes] = await Promise.all([
          supabase
            .from('tpr_tipos_receita')
            .select('tpr_id, tpr_nome')
            .eq('tpr_ativo', true)
            .order('tpr_nome', { ascending: true }),
          supabase
            .from('ban_bancos')
            .select(
              `ban_id, ban_nome,
               bcr_banco_conta (
                 bcr_id,
                 ctr_contas_receita (
                   ctr_id,
                   ctr_nome,
                   ctp_conta_tipo_receita (
                     ctp_id,
                     tpr_tipos_receita ( tpr_id, tpr_nome )
                   )
                 )
               )`
            )
            .eq('ban_ativo', true)
            .order('ban_nome', { ascending: true }),
        ]);

        if (tiposRes.error) throw tiposRes.error;
        if (bancosRes.error) throw bancosRes.error;

        const tiposPadrao: Tipo[] = (tiposRes.data ?? []).map((tipo) => ({
          id: toNumber(tipo.tpr_id) ?? 0,
          nome: toString(tipo.tpr_nome, 'Tipo sem nome'),
        }));

        const bancosFormatados = mapBancoRows(bancosRes.data ?? null, tiposPadrao).filter(
          (banco) => banco.contas.length > 0
        );

        setBancos(bancosFormatados);
        setFormulario((prev) => sincronizarFormulario(bancosFormatados, prev));

        if (bancosFormatados.length > 0) {
          setBancoSelecionado((prev) => prev ?? bancosFormatados[0]?.id ?? null);
        }

        await carregarHistorico(usuarioEncontrado);
      } catch (error) {
        console.error('Erro ao carregar dados das cobranças:', error);
        setMensagem({
          tipo: 'erro',
          texto: traduzirErroSupabase(
            error,
            'Não foi possível carregar as contas e tipos de receita. Recarregue a página e tente novamente.'
          ),
        });
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [carregarHistorico]);

  const bancoAtual = useMemo(
    () => bancos.find((banco) => banco.id === bancoSelecionado) ?? null,
    [bancos, bancoSelecionado]
  );

  const resumoFormulario = useMemo(() => {
    return bancos.map((banco) => {
      const contas = banco.contas.map((conta) => {
        const tipos = conta.tipos.map((tipo) => {
          const entrada = formulario[banco.id]?.[conta.id]?.[tipo.id];
          const valor = avaliarValor(entrada?.valor);
          return {
            id: tipo.id,
            nome: tipo.nome,
            valor: valor && valor > 0 ? valor : 0,
          };
        });

        const totalConta = tipos.reduce((acc, item) => acc + item.valor, 0);

        return {
          id: conta.id,
          nome: conta.nome,
          tipos,
          total: totalConta,
        };
      });

      const totalBanco = contas.reduce((acc, conta) => acc + conta.total, 0);

      return {
        id: banco.id,
        nome: banco.nome,
        contas,
        total: totalBanco,
      };
    });
  }, [bancos, formulario]);

  const totalGeral = useMemo(
    () => resumoFormulario.reduce((acc, banco) => acc + banco.total, 0),
    [resumoFormulario]
  );

  const historicoAgrupado = useMemo(() => {
    return historico.reduce<Record<string, { banco: string; total: number }>>((acc, item) => {
      const chave = item.banco;
      if (!acc[chave]) {
        acc[chave] = { banco: item.banco, total: 0 };
      }
      acc[chave].total += item.valor;
      return acc;
    }, {});
  }, [historico]);

  const atualizarFormulario = useCallback(
    (bancoId: number, contaId: number, tipoId: number, patch: Partial<FormEntry>) => {
      setFormulario((prev) => {
        const proximo: FormState = { ...prev };
        const bancoAtual = proximo[bancoId] ?? {};
        const contaAtual = bancoAtual[contaId] ?? {};
        const entradaAtual = contaAtual[tipoId] ?? { valor: '', data: dataPadrao };

        return {
          ...proximo,
          [bancoId]: {
            ...bancoAtual,
            [contaId]: {
              ...contaAtual,
              [tipoId]: {
                ...entradaAtual,
                ...patch,
              },
            },
          },
        };
      });
    },
    []
  );

  const handleRegistrar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) {
      setMensagem({
        tipo: 'erro',
        texto: 'Selecione um usuário antes de registrar cobranças.',
      });
      return;
    }

    const registros = bancos
      .flatMap((banco) =>
        banco.contas.flatMap((conta) =>
          conta.tipos.map((tipo) => {
            const entrada = formulario[banco.id]?.[conta.id]?.[tipo.id];
            const valorCalculado = avaliarValor(entrada?.valor);
            if (!valorCalculado || valorCalculado <= 0) {
              return null;
            }

            const dataRegistro = entrada?.data || dataPadrao;

            return {
              bancoId: banco.id,
              contaId: conta.id,
              tipoId: tipo.id,
              payload: {
                cob_ban_id: banco.id,
                cob_ctr_id: conta.id,
                cob_tpr_id: tipo.id,
                cob_usr_id: usuario.usr_id,
                cob_data: dataRegistro,
                cob_valor: valorCalculado,
              },
            };
          })
        )
      )
      .filter((item): item is { bancoId: number; contaId: number; tipoId: number; payload: any } => Boolean(item));

    if (registros.length === 0) {
      setMensagem({
        tipo: 'info',
        texto: 'Informe valores e datas para pelo menos um tipo de receita antes de salvar.',
      });
      return;
    }

    try {
      setRegistrando(true);
      setMensagem(null);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('cob_cobrancas')
        .insert(registros.map((registro) => registro.payload));

      if (error) throw error;

      setFormulario((prev) => {
        const proximo = { ...prev };
        registros.forEach(({ bancoId, contaId, tipoId }) => {
          if (proximo[bancoId]?.[contaId]?.[tipoId]) {
            proximo[bancoId][contaId][tipoId] = {
              ...proximo[bancoId][contaId][tipoId],
              valor: '',
            };
          }
        });
        return { ...proximo };
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
          'Não foi possível registrar as cobranças. Verifique os dados informados e tente novamente.'
        ),
      });
    } finally {
      setRegistrando(false);
    }
  };

  if (carregando) {
    return (
      <>
        <Header title="Lançamento de Cobrança" />
        <div className="page-content flex h-96 items-center justify-center">
          <Loading size="lg" text="Carregando dados..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Lançamento de Cobrança"
        subtitle="Registre valores por banco, conta e tipo de receita com conferência visual do que será enviado"
      />

      <div className="page-content space-y-6">
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

        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Resumo por banco</h2>
              <p className="text-sm text-gray-600">
                Utilize o seletor para alternar os lançamentos. O total geral considera todos os bancos preenchidos.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <label className="text-sm font-medium text-gray-700" htmlFor="banco-selecionado">
                Banco
              </label>
              <select
                id="banco-selecionado"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={bancoSelecionado ?? ''}
                onChange={(event) => setBancoSelecionado(Number(event.target.value) || null)}
              >
                {bancos.length === 0 && <option value="">Nenhum banco disponível</option>}
                {bancos.map((banco) => (
                  <option key={banco.id} value={banco.id}>
                    {banco.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {resumoFormulario.map((resumo) => (
              <div
                key={resumo.id}
                className={`rounded-lg border px-4 py-3 shadow-sm transition ${
                  resumo.id === bancoSelecionado
                    ? 'border-primary-400 bg-primary-50 text-primary-900'
                    : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{resumo.nome}</p>
                <p className="mt-1 text-xl font-semibold">{formatCurrency(resumo.total)}</p>
              </div>
            ))}
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total geral</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(totalGeral)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <form className="space-y-6" onSubmit={handleRegistrar}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Lançar cobranças</h2>
                <p className="text-sm text-gray-600">
                  Informe valores e datas para cada tipo de receita disponível nas contas do banco selecionado.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    bancoAtual?.contas.forEach((conta) =>
                      conta.tipos.forEach((tipo) =>
                        atualizarFormulario(bancoAtual.id, conta.id, tipo.id, { valor: '', data: dataPadrao })
                      )
                    )
                  }
                  disabled={!bancoAtual || registrando}
                >
                  Limpar banco atual
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={registrando} disabled={registrando}>
                  Registrar cobranças
                </Button>
              </div>
            </div>

            {!bancoAtual ? (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
                Vincule contas e tipos de receita a um banco para habilitar o formulário.
              </div>
            ) : (
              <div className="space-y-6">
                {bancoAtual.contas.map((conta) => (
                  <div key={conta.id} className="rounded-lg border border-gray-200 bg-white/70 p-4 shadow-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{conta.nome}</h3>
                        <p className="text-xs text-gray-500">Conta #{conta.id}</p>
                      </div>
                      <div className="rounded-md bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                        Total:{' '}
                        {formatCurrency(
                          conta.tipos.reduce((acc, tipo) => {
                            const valor = avaliarValor(formulario[bancoAtual.id]?.[conta.id]?.[tipo.id]?.valor);
                            return acc + (valor && valor > 0 ? valor : 0);
                          }, 0)
                        )}
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">Tipo de receita</th>
                            <th className="px-4 py-3 text-left font-semibold">Data</th>
                            <th className="px-4 py-3 text-left font-semibold">Valor</th>
                            <th className="px-4 py-3 text-left font-semibold">Resultado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {conta.tipos.map((tipo) => {
                            const entrada = formulario[bancoAtual.id]?.[conta.id]?.[tipo.id];
                            const valorCalculado = avaliarValor(entrada?.valor);
                            return (
                              <tr key={tipo.id} className="bg-white/80">
                                <td className="px-4 py-3 font-medium text-gray-700">{tipo.nome}</td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="date"
                                    value={entrada?.data ?? dataPadrao}
                                    onChange={(event) =>
                                      atualizarFormulario(bancoAtual.id, conta.id, tipo.id, {
                                        data: event.target.value,
                                      })
                                    }
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    value={entrada?.valor ?? ''}
                                    onChange={(event) =>
                                      atualizarFormulario(bancoAtual.id, conta.id, tipo.id, {
                                        valor: event.target.value,
                                      })
                                    }
                                    fullWidth
                                  />
                                </td>
                                <td className="px-4 py-3 text-sm text-primary-700">
                                  {valorCalculado && valorCalculado > 0 ? formatCurrency(valorCalculado) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </form>
        </Card>

        <Card title="Resumo dos valores informados" subtitle="Visualize o detalhamento por banco, conta e tipo antes de enviar">
          <Table
            columns={[
              { key: 'banco', label: 'Banco', sortable: true },
              { key: 'conta', label: 'Conta', sortable: true },
              { key: 'tipo', label: 'Tipo', sortable: true },
              {
                key: 'valor',
                label: 'Valor',
                render: (item: any) => formatCurrency(item.valor as number),
                sortable: true,
              },
            ]}
            data={resumoFormulario.flatMap((banco) =>
              banco.contas.flatMap((conta) =>
                conta.tipos
                  .filter((tipo) => tipo.valor > 0)
                  .map((tipo) => ({
                    banco: banco.nome,
                    conta: conta.nome,
                    tipo: tipo.nome,
                    valor: tipo.valor,
                  }))
              )
            )}
            keyExtractor={(item, index) => `${item.banco}-${item.conta}-${item.tipo}-${index}`}
            emptyMessage="Nenhum valor pendente para registro."
          />
        </Card>

        <Card title="Histórico recente" subtitle="Últimos lançamentos agrupados por banco para conferência">
          {carregandoHistorico ? (
            <div className="py-8">
              <Loading text="Carregando histórico..." />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Object.values(historicoAgrupado).map((item) => (
                  <div key={item.banco} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{item.banco}</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(item.total)}</p>
                  </div>
                ))}
              </div>

              <Table
                columns={[
                  { key: 'data', label: 'Data', sortable: true },
                  { key: 'banco', label: 'Banco', sortable: true },
                  { key: 'conta', label: 'Conta', sortable: true },
                  { key: 'tipo', label: 'Tipo', sortable: true },
                  {
                    key: 'valor',
                    label: 'Valor',
                    render: (item: HistoricoItem) => formatCurrency(item.valor),
                    sortable: true,
                  },
                ]}
                data={historico.map((item) => ({
                  ...item,
                  data: item.data
                    ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${item.data}T00:00:00`))
                    : '—',
                }))}
                keyExtractor={(item) => item.id}
                emptyMessage="Ainda não há cobranças registradas para este usuário."
              />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
