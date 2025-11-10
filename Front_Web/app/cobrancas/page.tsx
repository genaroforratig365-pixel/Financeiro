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

type CategoriaReceita = 'depositos' | 'titulos' | 'outras';

type TipoOption = {
  id: number;
  nome: string;
  codigo: string;
  categoria: CategoriaReceita;
};

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

type FormularioValores = Record<number, Record<number, string>>;

type LancamentoExistente = {
  id: number;
  contaId: number;
  tipoId: number;
  valor: number;
  bancoId: number | null;
};

type CobrancaHistorico = {
  id: number;
  conta: string;
  tipo: string;
  banco: string;
  data: string;
  valor: number;
};

type ResumoBanco = { bancoId: number | null; bancoNome: string; total: number };

type ResumoTipo = {
  tipoId: number;
  nome: string;
  codigo: string;
  categoria: CategoriaReceita;
  total: number;
};

type CategoriaConfig = {
  chave: CategoriaReceita;
  titulo: string;
  descricao: string;
};

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const calcularRetroativo = (dias: number): string => {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() - dias);
  return toISODate(data);
};

const normalizarEntradaNumerica = (valor: string): string =>
  valor.replace(/\./g, '').replace(/\s+/g, '').replace(/,/g, '.');

const avaliarValor = (entrada: string): number | null => {
  if (!entrada) {
    return null;
  }

  const texto = normalizarEntradaNumerica(entrada);
  if (!texto) {
    return null;
  }

  const resultado = evaluateMath(texto);
  if (resultado !== null) {
    return Math.round(resultado * 100) / 100;
  }

  const parsed = Number(texto);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
};

const formatarValorParaInput = (valor: number): string => valor.toFixed(2).replace('.', ',');

const gerarChaveLancamento = (contaId: number, tipoId: number) => `${contaId}-${tipoId}`;

const CATEGORIAS_CONFIG: CategoriaConfig[] = [
  {
    chave: 'depositos',
    titulo: 'Depósitos e PIX',
    descricao: 'Registre depósitos bancários, PIX e valores antecipados por conta.',
  },
  {
    chave: 'titulos',
    titulo: 'Títulos (Boletos)',
    descricao: 'Informe os recebimentos oriundos de boletos emitidos.',
  },
  {
    chave: 'outras',
    titulo: 'Outras Receitas',
    descricao: 'Cartões, vendas à vista e demais recebimentos.',
  },
];

const categoriaVariant: Record<CategoriaReceita, 'default' | 'primary' | 'danger' | 'success'> = {
  depositos: 'success',
  titulos: 'danger',
  outras: 'primary',
};

const obterCategoriaPorCodigo = (codigo: string | null): CategoriaReceita => {
  const referencia = (codigo ?? '').trim();
  if (referencia.startsWith('200')) return 'titulos';
  if (referencia.startsWith('201')) return 'depositos';
  if (referencia.startsWith('202')) return 'outras';
  return 'outras';
};

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

export default function LancamentoCobrancaPage() {
  const [hojeIso] = useState(() => toISODate(new Date()));
  const limiteRetroativo = useMemo(() => calcularRetroativo(7), []);

  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoLancamentos, setCarregandoLancamentos] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  const [tipos, setTipos] = useState<TipoOption[]>([]);
  const [contas, setContas] = useState<ContaOption[]>([]);
  const [formulario, setFormulario] = useState<FormularioValores>({});
  const [lancamentosExistentes, setLancamentosExistentes] = useState<Record<string, LancamentoExistente>>({});

  const [historico, setHistorico] = useState<CobrancaHistorico[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const [dataReferencia, setDataReferencia] = useState(() => toISODate(new Date()));

  const podeEditar = dataReferencia >= limiteRetroativo && dataReferencia <= hojeIso;

  const contasMap = useMemo(() => {
    const mapa = new Map<number, ContaOption>();
    contas.forEach((conta) => mapa.set(conta.id, conta));
    return mapa;
  }, [contas]);

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

    return Array.from(agrupados.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
    );
  }, [contas]);

  const tiposPorCategoria = useMemo(() => {
    const mapa: Record<CategoriaReceita, TipoOption[]> = {
      depositos: [],
      titulos: [],
      outras: [],
    };

    tipos.forEach((tipo) => {
      mapa[tipo.categoria].push(tipo);
    });

    return mapa;
  }, [tipos]);

  const totaisPorCategoria = useMemo(() => {
    const totais: Record<CategoriaReceita, number> = {
      depositos: 0,
      titulos: 0,
      outras: 0,
    };

    contas.forEach((conta) => {
      const valoresConta = formulario[conta.id] ?? {};
      tipos.forEach((tipo) => {
        const valorCalculado = avaliarValor(valoresConta[tipo.id] ?? '');
        if (valorCalculado && valorCalculado > 0) {
          totais[tipo.categoria] += valorCalculado;
        }
      });
    });

    return totais;
  }, [contas, tipos, formulario]);

  const totalFormulario = useMemo(() => {
    return Object.values(totaisPorCategoria).reduce((acc, valor) => acc + valor, 0);
  }, [totaisPorCategoria]);

  const resumoFormularioPorBanco = useMemo<ResumoBanco[]>(() => {
    const mapa = new Map<number | null, number>();

    contas.forEach((conta) => {
      const valoresConta = formulario[conta.id] ?? {};
      const bancoId = conta.bancoId ?? null;
      tipos.forEach((tipo) => {
        const valorCalculado = avaliarValor(valoresConta[tipo.id] ?? '');
        if (valorCalculado && valorCalculado > 0) {
          mapa.set(bancoId, (mapa.get(bancoId) ?? 0) + valorCalculado);
        }
      });
    });

    return Array.from(mapa.entries())
      .filter(([, total]) => total > 0)
      .map(([bancoId, total]) => {
        const contaExemplo = contas.find((conta) => (conta.bancoId ?? null) === bancoId);
        return {
          bancoId,
          bancoNome: contaExemplo?.bancoNome ?? 'Sem banco vinculado',
          total,
        } satisfies ResumoBanco;
      })
      .sort((a, b) => a.bancoNome.localeCompare(b.bancoNome, 'pt-BR', { sensitivity: 'base' }));
  }, [contas, formulario, tipos]);

  const categoriasResumo = useMemo(() => {
    return [...CATEGORIAS_CONFIG].sort((a, b) => {
      if (a.chave === 'titulos' && b.chave !== 'titulos') return 1;
      if (b.chave === 'titulos' && a.chave !== 'titulos') return -1;
      return 0;
    });
  }, []);

  const resumoTiposPorCategoria = useMemo<Record<CategoriaReceita, ResumoTipo[]>>(() => {
    const base: Record<CategoriaReceita, ResumoTipo[]> = {
      depositos: [],
      titulos: [],
      outras: [],
    };

    tipos.forEach((tipo) => {
      let total = 0;

      contas.forEach((conta) => {
        const valoresConta = formulario[conta.id] ?? {};
        const valorCalculado = avaliarValor(valoresConta[tipo.id] ?? '');
        if (valorCalculado && Number.isFinite(valorCalculado)) {
          total += valorCalculado;
        }
      });

      base[tipo.categoria].push({
        tipoId: tipo.id,
        nome: tipo.nome,
        codigo: tipo.codigo,
        categoria: tipo.categoria,
        total: Math.round(total * 100) / 100,
      });
    });

    (Object.keys(base) as CategoriaReceita[]).forEach((categoria) => {
      base[categoria] = base[categoria].sort((a, b) => {
        const codigoDiff = a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' });
        if (codigoDiff !== 0) return codigoDiff;
        return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
      });
    });

    return base;
  }, [tipos, contas, formulario]);

  const resumoSalvoPorBanco = useMemo<ResumoBanco[]>(() => {
    const mapa = new Map<number | null, number>();

    Object.values(lancamentosExistentes).forEach((registro) => {
      const conta = contasMap.get(registro.contaId);
      const bancoId = conta?.bancoId ?? registro.bancoId ?? null;
      mapa.set(bancoId, (mapa.get(bancoId) ?? 0) + registro.valor);
    });

    return Array.from(mapa.entries())
      .filter(([, total]) => Math.abs(total) > 0)
      .map(([bancoId, total]) => {
        const contaExemplo = contas.find((conta) => (conta.bancoId ?? null) === bancoId);
        return {
          bancoId,
          bancoNome: contaExemplo?.bancoNome ?? 'Sem banco vinculado',
          total,
        } satisfies ResumoBanco;
      })
      .sort((a, b) => a.bancoNome.localeCompare(b.bancoNome, 'pt-BR', { sensitivity: 'base' }));
  }, [contas, contasMap, lancamentosExistentes]);

  const carregarHistorico = useCallback(
    async (usuarioAtual: UsuarioRow) => {
      try {
        setCarregandoHistorico(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('cob_cobrancas')
          .select(
            `cob_id, cob_data, cob_valor,
             ctr_contas_receita(ctr_nome, ctr_ban_id, ban_bancos(ban_nome)),
             tpr_tipos_receita(tpr_nome)`
          )
          .eq('cob_usr_id', usuarioAtual.usr_id)
          .gte('cob_data', limiteRetroativo)
          .order('cob_data', { ascending: false })
          .order('cob_criado_em', { ascending: false })
          .limit(50);

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
            valor: Number(item.cob_valor ?? 0),
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
    [limiteRetroativo],
  );

  const carregarLancamentosDia = useCallback(
    async (usuarioAtual: UsuarioRow, data: string, contasBase: ContaOption[] = []) => {
      try {
        setCarregandoLancamentos(true);
        const supabase = getSupabaseClient();
        const { data: registros, error } = await supabase
          .from('cob_cobrancas')
          .select('cob_id, cob_ctr_id, cob_tpr_id, cob_valor')
          .eq('cob_usr_id', usuarioAtual.usr_id)
          .eq('cob_data', data);

        if (error) throw error;

        const mapa: Record<string, LancamentoExistente> = {};
        (registros ?? []).forEach((registro) => {
          const contaId = Number(registro.cob_ctr_id);
          const tipoId = Number(registro.cob_tpr_id);
          const conta = contasBase.find((item) => item.id === contaId);
          const chave = gerarChaveLancamento(contaId, tipoId);
          mapa[chave] = {
            id: Number(registro.cob_id),
            contaId,
            tipoId,
            valor: Number(registro.cob_valor ?? 0),
            bancoId: conta?.bancoId ?? null,
          };
        });

        setLancamentosExistentes(mapa);
      } catch (error) {
        console.error('Erro ao carregar lançamentos de cobrança do dia:', error);
        setLancamentosExistentes({});
      } finally {
        setCarregandoLancamentos(false);
      }
    },
    [],
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
          userEmail ?? undefined,
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

        const [tiposRes, contasRes] = await Promise.all([
          supabase
            .from('tpr_tipos_receita')
            .select('tpr_id, tpr_nome, tpr_codigo')
            .eq('tpr_ativo', true)
            .order('tpr_nome', { ascending: true }),
          supabase
            .from('ctr_contas_receita')
            .select('ctr_id, ctr_nome, ctr_ban_id, ban_bancos(ban_nome)')
            .eq('ctr_ativo', true)
            .order('ctr_nome', { ascending: true }),
        ]);

        if (tiposRes.error) throw tiposRes.error;
        if (contasRes.error) throw contasRes.error;

        const tiposFormatados: TipoOption[] = (tiposRes.data ?? []).map((tipo) => ({
          id: Number(tipo.tpr_id),
          nome: tipo.tpr_nome ?? 'Tipo sem nome',
          codigo: tipo.tpr_codigo ?? '',
          categoria: obterCategoriaPorCodigo(tipo.tpr_codigo ?? ''),
        }));

        const contasFormatadas: ContaOption[] = (contasRes.data ?? []).map((conta) => {
          const bancoRelacionado = Array.isArray(conta.ban_bancos)
            ? conta.ban_bancos[0]
            : (conta.ban_bancos as { ban_nome?: string | null } | null);
          return {
            id: Number(conta.ctr_id),
            nome: conta.ctr_nome ?? 'Conta sem nome',
            bancoId: conta.ctr_ban_id !== null ? Number(conta.ctr_ban_id) : null,
            bancoNome: bancoRelacionado?.ban_nome ?? 'Sem banco vinculado',
          } satisfies ContaOption;
        });

        setTipos(tiposFormatados);
        setContas(contasFormatadas);
        setMensagem(null);

        await carregarHistorico(usuarioEncontrado);
        await carregarLancamentosDia(usuarioEncontrado, dataReferencia, contasFormatadas);
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
  }, [carregarHistorico, carregarLancamentosDia, dataReferencia]);

  useEffect(() => {
    if (!usuario) {
      return;
    }
    if (contas.length === 0 || tipos.length === 0) {
      return;
    }
    carregarLancamentosDia(usuario, dataReferencia, contas);
  }, [usuario, contas, tipos, dataReferencia, carregarLancamentosDia]);

  useEffect(() => {
    if (contas.length === 0 || tipos.length === 0) {
      return;
    }

    setFormulario(() => {
      const mapa: FormularioValores = {};
      contas.forEach((conta) => {
        mapa[conta.id] = {};
        tipos.forEach((tipo) => {
          const chave = gerarChaveLancamento(conta.id, tipo.id);
          const existente = lancamentosExistentes[chave];
          mapa[conta.id][tipo.id] = existente ? formatarValorParaInput(existente.valor) : '';
        });
      });
      return mapa;
    });
  }, [contas, tipos, lancamentosExistentes]);

  const handleValorChange = (contaId: number, tipoId: number, valor: string) => {
    setFormulario((prev) => ({
      ...prev,
      [contaId]: {
        ...(prev[contaId] ?? {}),
        [tipoId]: valor,
      },
    }));
  };

  const handleSalvarLancamentos = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) {
      setMensagem({
        tipo: 'erro',
        texto: 'Selecione um usuário antes de registrar cobranças.',
      });
      return;
    }

    if (!podeEditar) {
      setMensagem({
        tipo: 'erro',
        texto: 'A edição está liberada apenas para lançamentos de até 7 dias anteriores ao dia atual.',
      });
      return;
    }

    const registrosParaUpsert: any[] = [];
    const idsParaExcluir: number[] = [];

    contas.forEach((conta) => {
      const valoresConta = formulario[conta.id] ?? {};
      tipos.forEach((tipo) => {
        const chave = gerarChaveLancamento(conta.id, tipo.id);
        const existente = lancamentosExistentes[chave];
        const valorEntrada = valoresConta[tipo.id] ?? '';
        const valorCalculado = avaliarValor(valorEntrada);

        if (valorCalculado && valorCalculado > 0) {
          if (!existente || Math.abs(valorCalculado - existente.valor) > 0.009) {
            registrosParaUpsert.push({
              cob_id: existente?.id,
              cob_ctr_id: conta.id,
              cob_tpr_id: tipo.id,
              cob_usr_id: usuario.usr_id,
              cob_data: dataReferencia,
              cob_valor: valorCalculado,
            });
          }
        } else if (existente) {
          idsParaExcluir.push(existente.id);
        }
      });
    });

    if (registrosParaUpsert.length === 0 && idsParaExcluir.length === 0) {
      setMensagem({
        tipo: 'info',
        texto: 'Nenhuma alteração foi identificada para salvar.',
      });
      return;
    }

    try {
      setRegistrando(true);
      setMensagem(null);
      const supabase = getSupabaseClient();

      if (registrosParaUpsert.length > 0) {
        const payload = registrosParaUpsert.map((registro) => {
          const { cob_id, ...restante } = registro;
          return cob_id ? { cob_id, ...restante } : restante;
        });
        const { error } = await supabase
          .from('cob_cobrancas')
          .upsert(payload, { onConflict: 'cob_id' });
        if (error) throw error;
      }

      if (idsParaExcluir.length > 0) {
        const { error } = await supabase
          .from('cob_cobrancas')
          .delete()
          .in('cob_id', idsParaExcluir);
        if (error) throw error;
      }

      setMensagem({
        tipo: 'sucesso',
        texto: 'Lançamentos de cobrança atualizados com sucesso.',
      });

      await carregarLancamentosDia(usuario, dataReferencia, contas);
      await carregarHistorico(usuario);
    } catch (error) {
      console.error('Erro ao registrar cobranças:', error);
      setMensagem({
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível salvar os lançamentos de cobrança. Verifique os dados e tente novamente.',
        ),
      });
    } finally {
      setRegistrando(false);
    }
  };

  if (carregando) {
    return (
      <>
        <Header
          title="Lançamento de Cobrança"
          subtitle="Registre cobranças agrupando por banco, conta de receita e tipo associado"
        />
        <div className="page-content flex items-center justify-center h-96">
          <Loading text="Carregando contas, bancos e tipos de receita..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Lançamento de Cobrança"
        subtitle="Registre cobranças agrupando por banco, conta de receita e tipo associado"
      />

      <div className="page-content space-y-6">
        <Card>
          <div className="space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Registrar cobranças</h2>
                <p className="text-sm text-gray-600">
                  Utilize os cards por categoria para informar os valores recebidos por banco e conta.
                </p>
              </div>
              <div className="rounded-lg border border-primary-100 bg-primary-50/50 px-4 py-2 text-sm text-primary-700">
                Total informado: <strong>{formatCurrency(totalFormulario)}</strong>
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

            {contas.length > 0 && tipos.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 px-4 py-3">
                    <h3 className="text-base font-semibold text-gray-900">Resumo por banco</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Totais informados no formulário agrupados pelos bancos vinculados.
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    {resumoFormularioPorBanco.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Nenhum valor informado para os bancos cadastrados.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Banco</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">
                                Valor informado
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {resumoFormularioPorBanco.map((resumo) => (
                              <tr key={`form-resumo-${resumo.bancoId ?? 'sem-banco'}`}>
                                <td className="px-3 py-2 text-gray-700">{resumo.bancoNome}</td>
                                <td className="px-3 py-2 text-right font-medium text-gray-900">
                                  {formatCurrency(resumo.total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-700">Total</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-900">
                                {formatCurrency(totalFormulario)}
                              </th>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {categoriasResumo.map((categoria) => {
                  const linhas = resumoTiposPorCategoria[categoria.chave];
                  const totalCategoria = totaisPorCategoria[categoria.chave];
                  const classes = [
                    'rounded-lg border border-gray-200 bg-white shadow-sm',
                    categoria.chave === 'titulos' ? 'lg:col-span-3' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <div key={`resumo-${categoria.chave}`} className={classes}>
                      <div className="border-b border-gray-200 px-4 py-3">
                        <h3 className="text-base font-semibold text-gray-900">{categoria.titulo}</h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Dados da tabela de tipos de receita vinculada à categoria selecionada.
                        </p>
                      </div>
                      <div className="px-4 py-3">
                        {linhas.length === 0 ? (
                          <p className="text-sm text-gray-500">
                            Nenhum tipo de receita foi configurado para esta categoria.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">
                                    Código / Tipo
                                  </th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Valor</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {linhas.map((linha) => (
                                  <tr key={linha.tipoId}>
                                    <td className="px-3 py-2 text-gray-700">
                                      <span className="font-medium text-gray-800">{linha.codigo}</span>
                                      <span className="ml-2 text-gray-500">{linha.nome}</span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                                      {formatCurrency(linha.total)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Total</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-900">
                                    {formatCurrency(totalCategoria)}
                                  </th>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <form className="space-y-6" onSubmit={handleSalvarLancamentos}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,240px)] md:items-end">
                <label className="text-sm font-medium text-gray-700">
                  Data dos lançamentos
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    min={limiteRetroativo}
                    max={hojeIso}
                    value={dataReferencia}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      setDataReferencia(value);
                      setMensagem(null);
                    }}
                  />
                </label>

                {!podeEditar && (
                  <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
                    Edição disponível apenas para os últimos 7 dias úteis. Ajuste a data para atualizar os valores.
                  </div>
                )}
              </div>

              {carregandoLancamentos ? (
                <div className="py-12">
                  <Loading text="Carregando lançamentos para a data selecionada..." />
                </div>
              ) : contas.length === 0 || tipos.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  Cadastre contas de receita e tipos de receita para habilitar os lançamentos de cobrança.
                </div>
              ) : (
                <div className="space-y-6">
                  {CATEGORIAS_CONFIG.map((categoria) => {
                    const tiposCategoria = tiposPorCategoria[categoria.chave];
                    const totalCategoria = totaisPorCategoria[categoria.chave];

                    return (
                      <Card
                        key={categoria.chave}
                        title={categoria.titulo}
                        subtitle={`Total informado: ${formatCurrency(totalCategoria)}`}
                        variant={categoriaVariant[categoria.chave]}
                        padding="sm"
                      >
                        <div className="space-y-4">
                          <p className="text-sm text-gray-600">{categoria.descricao}</p>

                          {tiposCategoria.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              Cadastre tipos de receita com o código correspondente para habilitar este card.
                            </p>
                          ) : bancosAgrupados.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              Cadastre contas de receita vinculadas a bancos para lançar esta categoria.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {bancosAgrupados.map((banco) => (
                                <div
                                  key={banco.id ?? 'null'}
                                  className="space-y-3 rounded-lg border border-gray-200 bg-white/80 p-3 shadow-sm"
                                >
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-gray-800">{banco.nome}</h4>
                                    <span className="text-xs text-gray-400">{banco.contas.length} conta(s)</span>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                                      <thead className="bg-gray-50">
                                        <tr>
                                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Conta</th>
                                          {tiposCategoria.map((tipo) => (
                                            <th key={tipo.id} className="px-3 py-2 text-left font-semibold text-gray-600">
                                              {tipo.nome}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100 bg-white/80">
                                        {banco.contas.map((conta) => {
                                          const valoresConta = formulario[conta.id] ?? {};
                                          return (
                                            <tr key={conta.id}>
                                              <td className="px-3 py-2 font-medium text-gray-700">{conta.nome}</td>
                                              {tiposCategoria.map((tipo) => {
                                                const chave = gerarChaveLancamento(conta.id, tipo.id);
                                                const valorCampo = valoresConta[tipo.id] ?? '';
                                                const resultado = avaliarValor(valorCampo ?? '');
                                                const valorSalvo = lancamentosExistentes[chave]?.valor ?? null;
                                                return (
                                                  <td key={tipo.id} className="px-3 py-2 align-top">
                                                    <div className="space-y-1">
                                                      <Input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={valorCampo}
                                                        onChange={(event) =>
                                                          handleValorChange(conta.id, tipo.id, event.target.value)
                                                        }
                                                        helperText={
                                                          resultado !== null
                                                            ? `Resultado: ${formatCurrency(resultado)}`
                                                            : undefined
                                                        }
                                                        disabled={!podeEditar}
                                                        fullWidth
                                                      />
                                                      {valorSalvo !== null && (
                                                        <p className="text-xs text-gray-400">
                                                          Salvo: {formatCurrency(valorSalvo)}
                                                        </p>
                                                      )}
                                                    </div>
                                                  </td>
                                                );
                                              })}
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
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  loading={registrando}
                  disabled={!podeEditar || contas.length === 0 || tipos.length === 0}
                >
                  Salvar lançamentos do dia
                </Button>
              </div>
            </form>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2.5fr)_minmax(280px,1fr)]">
          <Card title="Resumo de lançamentos">
            {resumoSalvoPorBanco.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nenhum lançamento salvo para a data selecionada.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Banco</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600">Total salvo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white/80">
                    {resumoSalvoPorBanco.map((resumo) => (
                      <tr key={resumo.bancoId ?? 'null-salvo'}>
                        <td className="px-4 py-2 text-gray-700">{resumo.bancoNome}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">
                          {formatCurrency(resumo.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card title="Totais informados" padding="sm">
              {resumoFormularioPorBanco.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum valor informado no formulário.</p>
              ) : (
                <ul className="space-y-2">
                  {resumoFormularioPorBanco.map((resumo) => (
                    <li
                      key={resumo.bancoId ?? 'null-form'}
                      className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-gray-700">{resumo.bancoNome}</span>
                      <span className="text-sm font-semibold text-primary-700">
                        {formatCurrency(resumo.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Limite de edição" padding="sm">
              <p className="text-sm text-gray-600">
                Os lançamentos podem ser criados ou ajustados até 7 dias retroativos em relação a {formatarDataPt(hojeIso)}.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Intervalo permitido: {formatarDataPt(limiteRetroativo)} até {formatarDataPt(hojeIso)}.
              </p>
            </Card>
          </div>
        </div>

        <Card title="Histórico recente">
          {carregandoHistorico ? (
            <div className="py-8">
              <Loading text="Buscando cobranças anteriores..." />
            </div>
          ) : historico.length === 0 ? (
            <p className="text-sm text-gray-600">
              Nenhuma cobrança foi registrada recentemente para este usuário.
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
                      <td className="px-4 py-2 text-gray-700">{formatarDataPt(item.data)}</td>
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
