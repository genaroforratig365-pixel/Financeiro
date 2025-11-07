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

type Mensagem = { tipo: 'sucesso' | 'erro' | 'info'; texto: string };

type TipoOption = { id: number; nome: string };

type ContaOption = {
  id: number;
  nome: string;
  bancoId: number | null;
  bancoNome: string | null;
};

type BancoAgrupado = {
  id: number | null;
  nome: string;
  contas: ContaOption[];
};

type FormEntry = {
  tipoId: number | '';
  data: string;
  valor: string;
};

type FormState = Record<number, FormEntry>;

type CobrancaHistorico = {
  id: number;
  conta: string;
  tipo: string;
  banco: string;
  data: string;
  valor: number;
};

type ResumoBanco = {
  bancoId: number | null;
  bancoNome: string;
  total: number;
};

const dataPadrao = new Date().toISOString().split('T')[0];

const avaliarValor = (entrada: string): number | null => {
  if (!entrada) {
    return null;
  }

  return evaluateMath(entrada);
};

const toNumero = (valor: unknown): number => {
  const parsed = Number(valor);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function LancamentoCobrancaPage() {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  const [tipos, setTipos] = useState<TipoOption[]>([]);
  const [contas, setContas] = useState<ContaOption[]>([]);
  const [bancoSelecionadoId, setBancoSelecionadoId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<FormState>({});

  const [historico, setHistorico] = useState<CobrancaHistorico[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const bancosAgrupados = useMemo(() => {
    const agrupados = new Map<number | null, BancoAgrupado>();

    contas.forEach((conta) => {
      const chave = conta.bancoId ?? null;
      const existente = agrupados.get(chave);
      if (existente) {
        existente.contas.push(conta);
      } else {
        agrupados.set(chave, {
          id: conta.bancoId ?? null,
          nome: conta.bancoNome ?? 'Sem banco vinculado',
          contas: [conta],
        });
      }
    });

    const lista = Array.from(agrupados.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );
    return lista;
  }, [contas]);

  const contasDoBancoSelecionado = useMemo(() => {
    if (bancoSelecionadoId === null) {
      return bancosAgrupados.length > 0 ? bancosAgrupados[0]?.contas ?? [] : [];
    }

    const bancoEncontrado = bancosAgrupados.find((banco) => banco.id === bancoSelecionadoId);
    return bancoEncontrado?.contas ?? [];
  }, [bancoSelecionadoId, bancosAgrupados]);

  const totalCalculado = useMemo(() => {
    return contas.reduce((acc, conta) => {
      const valor = avaliarValor(formulario[conta.id]?.valor ?? '');
      if (valor && valor > 0) {
        return acc + valor;
      }
      return acc;
    }, 0);
  }, [contas, formulario]);

  const resumoPorBanco = useMemo<ResumoBanco[]>(() => {
    const mapa = new Map<number | null, ResumoBanco>();

    bancosAgrupados.forEach((banco) => {
      const totalBanco = banco.contas.reduce((acc, conta) => {
        const valor = avaliarValor(formulario[conta.id]?.valor ?? '');
        if (valor && valor > 0) {
          return acc + valor;
        }
        return acc;
      }, 0);

      if (totalBanco > 0) {
        mapa.set(banco.id ?? null, {
          bancoId: banco.id ?? null,
          bancoNome: banco.nome,
          total: totalBanco,
        });
      }
    });

    return Array.from(mapa.values()).sort((a, b) =>
      a.bancoNome.localeCompare(b.bancoNome, 'pt-BR', { sensitivity: 'base' })
    );
  }, [bancosAgrupados, formulario]);

  const carregarHistorico = useCallback(
    async (usuarioAtual: UsuarioRow) => {
      try {
        setCarregandoHistorico(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('cob_cobrancas')
          .select(
            `cob_id, cob_data, cob_valor,
             ctr_contas_receita(ctr_nome, ban_bancos(ban_nome)),
             tpr_tipos_receita(tpr_nome)`
          )
          .eq('cob_usr_id', usuarioAtual.usr_id)
          .order('cob_data', { ascending: false })
          .order('cob_criado_em', { ascending: false })
          .limit(20);

        if (error) throw error;

        const itens = (data ?? []).map((item) => {
          const contaRelacionada = Array.isArray(item.ctr_contas_receita)
            ? item.ctr_contas_receita[0]
            : (item.ctr_contas_receita as Record<string, any> | null);
          const tipoRelacionado = Array.isArray(item.tpr_tipos_receita)
            ? item.tpr_tipos_receita[0]
            : (item.tpr_tipos_receita as Record<string, any> | null);
          const bancoRelacionado = contaRelacionada && 'ban_bancos' in contaRelacionada
            ? Array.isArray(contaRelacionada.ban_bancos)
              ? contaRelacionada.ban_bancos[0]
              : contaRelacionada.ban_bancos
            : null;

          return {
            id: Number(item.cob_id),
            data: String(item.cob_data ?? ''),
            valor: toNumero(item.cob_valor),
            conta: contaRelacionada?.ctr_nome ?? 'Conta não informada',
            tipo: tipoRelacionado?.tpr_nome ?? 'Tipo não informado',
            banco: bancoRelacionado?.ban_nome ?? 'Banco não informado',
          } satisfies CobrancaHistorico;
        });

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

        const [tiposRes, bancosRes, contasRes] = await Promise.all([
          supabase
            .from('tpr_tipos_receita')
            .select('tpr_id, tpr_nome')
            .eq('tpr_ativo', true)
            .order('tpr_nome', { ascending: true }),
          supabase
            .from('ban_bancos')
            .select('ban_id, ban_nome')
            .eq('ban_ativo', true)
            .order('ban_nome', { ascending: true }),
          supabase
            .from('ctr_contas_receita')
            .select('ctr_id, ctr_nome, ctr_ban_id')
            .eq('ctr_ativo', true)
            .order('ctr_nome', { ascending: true }),
        ]);

        if (tiposRes.error) throw tiposRes.error;
        if (bancosRes.error) throw bancosRes.error;
        if (contasRes.error) throw contasRes.error;

        const bancosMap = new Map<number, string>();
        (bancosRes.data ?? []).forEach((banco) => {
          bancosMap.set(Number(banco.ban_id), banco.ban_nome ?? 'Banco sem nome');
        });

        const contasFormatadas = (contasRes.data ?? []).map((conta) => {
          const bancoId = conta.ctr_ban_id !== null && conta.ctr_ban_id !== undefined
            ? Number(conta.ctr_ban_id)
            : null;
          return {
            id: Number(conta.ctr_id),
            nome: conta.ctr_nome ?? 'Conta sem nome',
            bancoId,
            bancoNome: bancoId !== null ? bancosMap.get(bancoId) ?? 'Banco não informado' : 'Sem banco vinculado',
          } satisfies ContaOption;
        });

        setContas(contasFormatadas);
        setTipos(
          (tiposRes.data ?? []).map((tipo) => ({
            id: Number(tipo.tpr_id),
            nome: tipo.tpr_nome ?? 'Tipo sem nome',
          }))
        );

        setFormulario(() => {
          const inicial: FormState = {};
          contasFormatadas.forEach((conta) => {
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

  useEffect(() => {
    if (bancosAgrupados.length > 0 && bancoSelecionadoId === null) {
      setBancoSelecionadoId(bancosAgrupados[0]?.id ?? null);
    }
  }, [bancosAgrupados, bancoSelecionadoId]);

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
        subtitle="Registre cobranças agrupando por banco, conta de receita e tipo associado"
      />

      <div className="page-content space-y-6">
        <Card>
          <div className="space-y-6">
            {carregando ? (
              <div className="py-12">
                <Loading text="Carregando contas, bancos e tipos de receita..." />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Registrar cobranças</h2>
                    <p className="text-sm text-gray-600">
                      Utilize o agrupamento por banco para distribuir os valores de cada conta e tipo de receita.
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary-100 bg-primary-50/50 px-4 py-2 text-sm text-primary-700">
                    Total selecionado: <strong>{formatCurrency(totalCalculado)}</strong>
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

                <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                  <form className="space-y-6" onSubmit={handleRegistrar}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        Banco para lançar
                        <select
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          value={
                            bancosAgrupados.length === 0
                              ? ''
                              : bancoSelecionadoId === null
                              ? 'null'
                              : String(bancoSelecionadoId)
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === '' && bancosAgrupados.length > 0) {
                              setBancoSelecionadoId(bancosAgrupados[0]?.id ?? null);
                              return;
                            }
                            setBancoSelecionadoId(value === 'null' ? null : Number(value));
                          }}
                        >
                          {bancosAgrupados.length === 0 && <option value="">Nenhum banco com contas cadastradas</option>}
                          {bancosAgrupados.map((banco) => (
                            <option key={banco.id ?? 'null'} value={banco.id ?? 'null'}>
                              {banco.nome} ({banco.contas.length})
                            </option>
                          ))}
                        </select>
                      </label>

                      <Button type="submit" variant="primary" loading={registrando} disabled={contas.length === 0}>
                        Registrar cobranças selecionadas
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {contasDoBancoSelecionado.length === 0 ? (
                        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                          Cadastre contas de receita vinculadas a bancos para habilitar esta etapa.
                        </div>
                      ) : (
                        contasDoBancoSelecionado.map((conta) => {
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
                                      onChange={(event) => atualizarFormulario(conta.id, { data: event.target.value })}
                                    />
                                  </label>

                                  <Input
                                    label="Valor"
                                    placeholder="Ex.: 1500"
                                    value={entrada?.valor ?? ''}
                                    onChange={(event) => atualizarFormulario(conta.id, { valor: event.target.value })}
                                    helperText={
                                      valorCalculado !== null
                                        ? `Resultado: ${formatCurrency(valorCalculado)}`
                                        : 'Informe um valor positivo.'
                                    }
                                    fullWidth
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </form>

                  <aside className="space-y-4">
                    <Card title="Resumo por banco" padding="sm">
                      {resumoPorBanco.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum valor informado até o momento.</p>
                      ) : (
                        <ul className="space-y-2">
                          {resumoPorBanco.map((resumo) => (
                            <li key={resumo.bancoId ?? 'null'} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                              <span className="text-sm font-medium text-gray-700">{resumo.bancoNome}</span>
                              <span className="text-sm font-semibold text-primary-700">{formatCurrency(resumo.total)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                    <Card title="Bancos disponíveis" padding="sm">
                      {bancosAgrupados.length === 0 ? (
                        <p className="text-sm text-gray-500">Cadastre bancos e vincule contas para começar.</p>
                      ) : (
                        <ul className="space-y-1 text-sm text-gray-600">
                          {bancosAgrupados.map((banco) => (
                            <li key={banco.id ?? 'null'} className="flex items-center justify-between">
                              <span>{banco.nome}</span>
                              <span className="text-xs text-gray-400">{banco.contas.length} conta(s)</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </aside>
                </div>
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
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Banco</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Conta</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Tipo</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white/80">
                  {historico.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-gray-700">{item.data}</td>
                      <td className="px-4 py-2 text-gray-700">{item.banco}</td>
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
