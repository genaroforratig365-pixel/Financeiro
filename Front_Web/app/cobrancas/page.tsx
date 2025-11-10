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

type BancoOption = {
  id: number;
  nome: string;
  codigo: string | null;
};

type LancamentoExistente = {
  id: number;
  contaId: number;
  tipoId: number;
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

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

const CATEGORIAS_CONFIG: CategoriaConfig[] = [
  {
    chave: 'depositos',
    titulo: 'Depósitos e PIX',
    descricao: 'Informe aqui os valores recebidos via depósito ou PIX.',
  },
  {
    chave: 'titulos',
    titulo: 'Títulos',
    descricao: 'Registre os valores quitados através de boletos e carnês.',
  },
  {
    chave: 'outras',
    titulo: 'Outras Receitas',
    descricao: 'Demais recebimentos associados ao banco selecionado.',
  },
];

const obterCategoriaPorCodigo = (codigo: string | null): CategoriaReceita => {
  const referencia = (codigo ?? '').trim();
  if (referencia.startsWith('200')) return 'titulos';
  if (referencia.startsWith('201')) return 'depositos';
  if (referencia.startsWith('202')) return 'outras';
  return 'outras';
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
  const [bancos, setBancos] = useState<BancoOption[]>([]);
  const [lancamentosExistentes, setLancamentosExistentes] = useState<Record<string, LancamentoExistente>>({});
  const [valoresPorBanco, setValoresPorBanco] = useState<Record<number, Record<number, string>>>({});

  const [dataReferencia, setDataReferencia] = useState(() => toISODate(new Date()));
  const [bancoSelecionadoId, setBancoSelecionadoId] = useState<number | null>(null);

  const podeEditar = dataReferencia >= limiteRetroativo && dataReferencia <= hojeIso;

  const contasMap = useMemo(() => {
    const mapa = new Map<number, ContaOption>();
    contas.forEach((conta) => mapa.set(conta.id, conta));
    return mapa;
  }, [contas]);

  const contasPorBanco = useMemo(() => {
    const mapa = new Map<number, ContaOption[]>();
    contas.forEach((conta) => {
      if (conta.bancoId === null) return;
      const atual = mapa.get(conta.bancoId) ?? [];
      atual.push(conta);
      mapa.set(conta.bancoId, atual);
    });
    return mapa;
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

    (Object.keys(mapa) as CategoriaReceita[]).forEach((categoria) => {
      mapa[categoria] = mapa[categoria].sort((a, b) => {
        const diffCodigo = a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' });
        if (diffCodigo !== 0) return diffCodigo;
        return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
      });
    });

    return mapa;
  }, [tipos]);

  const resumoFormularioPorBanco = useMemo<ResumoBanco[]>(() => {
    const totais = new Map<number, number>();

    Object.entries(valoresPorBanco).forEach(([bancoIdTexto, valores]) => {
      const totalCalculado = Object.values(valores).reduce((acc, valorTexto) => {
        const valor = avaliarValor(valorTexto);
        if (valor !== null && Number.isFinite(valor)) {
          return acc + valor;
        }
        return acc;
      }, 0);

      if (totalCalculado <= 0) {
        return;
      }

      const bancoId = Number(bancoIdTexto);
      totais.set(bancoId, Math.round(totalCalculado * 100) / 100);
    });

    return Array.from(totais.entries())
      .map(([bancoId, total]) => {
        const banco = bancos.find((item) => item.id === bancoId);
        return {
          bancoId,
          bancoNome: banco?.nome ?? 'Sem banco vinculado',
          total,
        } satisfies ResumoBanco;
      })
      .sort((a, b) => a.bancoNome.localeCompare(b.bancoNome, 'pt-BR', { sensitivity: 'base' }));
  }, [bancos, valoresPorBanco]);

  const totalFormulario = useMemo(() => {
    return resumoFormularioPorBanco.reduce((acc, item) => acc + item.total, 0);
  }, [resumoFormularioPorBanco]);

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

      Object.values(valoresPorBanco).forEach((valoresBanco) => {
        const valorCalculado = avaliarValor(valoresBanco[tipo.id] ?? '');
        if (valorCalculado !== null && Number.isFinite(valorCalculado)) {
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
  }, [tipos, valoresPorBanco]);

  const totaisPorCategoria = useMemo<Record<CategoriaReceita, number>>(() => {
    const totais: Record<CategoriaReceita, number> = {
      depositos: 0,
      titulos: 0,
      outras: 0,
    };

    (Object.entries(resumoTiposPorCategoria) as [CategoriaReceita, ResumoTipo[]][]).forEach(
      ([categoria, linhas]) => {
        const totalCategoria = linhas.reduce((acc, linha) => acc + linha.total, 0);
        totais[categoria] = Math.round(totalCategoria * 100) / 100;
      },
    );

    return totais;
  }, [resumoTiposPorCategoria]);

  const valoresSalvosPorBanco = useMemo<Record<number, Record<number, number>>>(() => {
    const base: Record<number, Record<number, number>> = {};

    Object.values(lancamentosExistentes).forEach((registro) => {
      const conta = contasMap.get(registro.contaId);
      const bancoId = conta?.bancoId;

      if (bancoId === null || bancoId === undefined) {
        return;
      }

      if (!base[bancoId]) {
        base[bancoId] = {};
      }

      base[bancoId][registro.tipoId] = (base[bancoId][registro.tipoId] ?? 0) + registro.valor;
    });

    return base;
  }, [contasMap, lancamentosExistentes]);

  const totaisSalvosPorBanco = useMemo(() => {
    const mapa = new Map<number, number>();
    Object.entries(valoresSalvosPorBanco).forEach(([bancoId, valores]) => {
      const total = Object.values(valores).reduce((acc, valor) => acc + valor, 0);
      mapa.set(Number(bancoId), Math.round(total * 100) / 100);
    });
    return mapa;
  }, [valoresSalvosPorBanco]);

  useEffect(() => {
    if (bancos.length > 0 && bancoSelecionadoId === null) {
      setBancoSelecionadoId(bancos[0].id);
    }
  }, [bancos, bancoSelecionadoId]);

  useEffect(() => {
    if (bancos.length === 0 || tipos.length === 0) {
      return;
    }

    const novoMapa: Record<number, Record<number, string>> = {};
    bancos.forEach((banco) => {
      const salvosBanco = valoresSalvosPorBanco[banco.id] ?? {};
      const valores = tipos.reduce((acc, tipo) => {
        const salvo = salvosBanco[tipo.id] ?? 0;
        acc[tipo.id] = salvo > 0 ? formatarValorParaInput(salvo) : '';
        return acc;
      }, {} as Record<number, string>);
      novoMapa[banco.id] = valores;
    });
    setValoresPorBanco(novoMapa);
  }, [bancos, tipos, valoresSalvosPorBanco]);

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
          const chave = gerarChaveLancamento(contaId, tipoId);
          mapa[chave] = {
            id: Number(registro.cob_id),
            contaId,
            tipoId,
            valor: Number(registro.cob_valor ?? 0),
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

        const [tiposRes, contasRes, bancosRes] = await Promise.all([
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
          supabase
            .from('ban_bancos')
            .select('ban_id, ban_nome, ban_codigo')
            .eq('ban_ativo', true)
            .order('ban_nome', { ascending: true }),
        ]);

        if (tiposRes.error) throw tiposRes.error;
        if (contasRes.error) throw contasRes.error;
        if (bancosRes.error) throw bancosRes.error;

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

        const bancosFormatados: BancoOption[] = (bancosRes.data ?? []).map((banco) => ({
          id: Number(banco.ban_id),
          nome: banco.ban_nome ?? 'Banco sem nome',
          codigo: banco.ban_codigo ?? null,
        }));

        setTipos(tiposFormatados);
        setContas(contasFormatadas);
        setBancos(bancosFormatados);
        setMensagem(null);

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
  }, [carregarLancamentosDia, dataReferencia]);

  useEffect(() => {
    if (!usuario) {
      return;
    }
    if (contas.length === 0 || tipos.length === 0) {
      return;
    }
    carregarLancamentosDia(usuario, dataReferencia, contas);
  }, [usuario, contas, tipos, dataReferencia, carregarLancamentosDia]);

  const handleValorBancoChange = (bancoId: number, tipoId: number, valor: string) => {
    setValoresPorBanco((prev) => ({
      ...prev,
      [bancoId]: {
        ...(prev[bancoId] ?? {}),
        [tipoId]: valor,
      },
    }));
  };

  const handlePreencherValorSalvo = (bancoId: number, tipoId: number) => {
    const valorSalvo = valoresSalvosPorBanco[bancoId]?.[tipoId] ?? 0;
    handleValorBancoChange(bancoId, tipoId, valorSalvo > 0 ? formatarValorParaInput(valorSalvo) : '');
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

    if (!bancoSelecionadoId) {
      setMensagem({
        tipo: 'erro',
        texto: 'Selecione um banco para registrar os valores.',
      });
      return;
    }

    const contasBanco = contasPorBanco.get(bancoSelecionadoId) ?? [];
    if (contasBanco.length === 0) {
      setMensagem({
        tipo: 'erro',
        texto: 'Nenhuma conta de receita está vinculada ao banco selecionado. Associe ao menos uma conta antes de lançar cobranças.',
      });
      return;
    }

    const valoresBanco = valoresPorBanco[bancoSelecionadoId] ?? {};
    const registrosParaUpsert: any[] = [];
    const idsParaExcluir: number[] = [];

    tipos.forEach((tipo) => {
      const valorEntrada = valoresBanco[tipo.id] ?? '';
      const valorCalculado = avaliarValor(valorEntrada);
      const registrosExistentes = contasBanco
        .map((conta) => {
          const chave = gerarChaveLancamento(conta.id, tipo.id);
          return lancamentosExistentes[chave];
        })
        .filter((registro): registro is LancamentoExistente => Boolean(registro));

      if (valorCalculado && valorCalculado > 0) {
        const distribuicao: { conta: ContaOption; valor: number; registro?: LancamentoExistente }[] = [];

        if (registrosExistentes.length > 0) {
          const totalExistente = registrosExistentes.reduce((acc, registro) => acc + registro.valor, 0);
          if (totalExistente > 0) {
            let acumulado = 0;
            registrosExistentes.forEach((registro, index) => {
              const conta = contasBanco.find((item) => item.id === registro.contaId);
              if (!conta) return;
              let valorConta = Math.round(valorCalculado * (registro.valor / totalExistente) * 100) / 100;
              if (index === registrosExistentes.length - 1) {
                valorConta = Math.round((valorCalculado - acumulado) * 100) / 100;
              } else {
                acumulado += valorConta;
              }
              distribuicao.push({ conta, valor: valorConta, registro });
            });
          }
        }

        if (distribuicao.length === 0) {
          const contaDestino = contasBanco[0];
          if (!contaDestino) {
            return;
          }
          distribuicao.push({ conta: contaDestino, valor: valorCalculado });
        }

        distribuicao.forEach(({ conta, valor, registro }) => {
          if (!registro || Math.abs(valor - registro.valor) > 0.009) {
            registrosParaUpsert.push({
              cob_id: registro?.id,
              cob_ctr_id: conta.id,
              cob_tpr_id: tipo.id,
              cob_usr_id: usuario.usr_id,
              cob_data: dataReferencia,
              cob_valor: valor,
            });
          }
        });

        registrosExistentes.forEach((registro) => {
          if (!distribuicao.some((item) => item.registro?.id === registro.id)) {
            idsParaExcluir.push(registro.id);
          }
        });
      } else {
        registrosExistentes.forEach((registro) => idsParaExcluir.push(registro.id));
      }
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
        const { error } = await supabase.from('cob_cobrancas').upsert(payload, { onConflict: 'cob_id' });
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
          subtitle="Registre os valores informados por banco e tipo de receita"
        />
        <div className="page-content flex h-96 items-center justify-center">
          <Loading text="Carregando bancos, contas e tipos de receita..." />
        </div>
      </>
    );
  }

  const bancoSelecionado = bancoSelecionadoId
    ? bancos.find((banco) => banco.id === bancoSelecionadoId)
    : null;
  let valoresBancoSelecionado: Record<number, string> = {};
  let valoresSalvosBancoSelecionado: Record<number, number> = {};

  if (bancoSelecionadoId !== null && bancoSelecionadoId !== undefined) {
    valoresBancoSelecionado = valoresPorBanco[bancoSelecionadoId] ?? {};
    valoresSalvosBancoSelecionado = valoresSalvosPorBanco[bancoSelecionadoId] ?? {};
  }

  return (
    <>
      <Header
        title="Lançamento de Cobrança"
        subtitle="Registre os valores informados por banco e tipo de receita"
      />

      <div className="page-content space-y-6">
        <Card>
          <form className="space-y-6" onSubmit={handleSalvarLancamentos}>
            <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:items-end">
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

            <div className="rounded-md border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800">
              Limite de edição
              <div className="mt-1 text-xs text-primary-700">
                Os lançamentos podem ser criados ou ajustados até 7 dias retroativos em relação a {formatarDataPt(hojeIso)}.
              </div>
              <div className="mt-1 text-xs text-primary-700">
                Intervalo permitido: {formatarDataPt(limiteRetroativo)} até {formatarDataPt(hojeIso)}.
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

            <div className="space-y-6">
              {carregandoLancamentos ? (
                <div className="py-12">
                  <Loading text="Carregando lançamentos para a data selecionada..." />
                </div>
              ) : contas.length === 0 || tipos.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  Cadastre contas de receita e tipos de receita para habilitar os lançamentos de cobrança.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Banco</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Total registrado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {bancos.map((banco) => {
                        const total = totaisSalvosPorBanco.get(banco.id) ?? 0;
                        return (
                          <tr key={banco.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-700">
                              <div className="font-medium text-gray-900">{banco.nome}</div>
                              {banco.codigo && (
                                <div className="text-xs text-gray-500">Código: {banco.codigo}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">
                              {formatCurrency(total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-semibold text-gray-900">Seleção do banco</h3>
              <p className="text-sm text-gray-500">
                Escolha o banco para informar os valores das contas contábeis configuradas na tabela de tipos de receita.
              </p>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 md:w-80"
                value={bancoSelecionadoId ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setBancoSelecionadoId(value ? Number(value) : null);
                  setMensagem(null);
                }}
                disabled={bancos.length === 0}
              >
                <option value="">Selecione um banco</option>
                {bancos.map((banco) => (
                  <option key={banco.id} value={banco.id}>
                    {banco.nome}
                  </option>
                ))}
              </select>
            </div>

            {carregandoLancamentos ? (
              <div className="py-12">
                <Loading text="Carregando lançamentos para a data selecionada..." />
              </div>
            ) : bancos.length === 0 || tipos.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                Cadastre bancos ativos e tipos de receita para habilitar os lançamentos de cobrança.
              </div>
            ) : !bancoSelecionado ? (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                Escolha um banco para visualizar os tipos disponíveis.
              </div>
            ) : (
              <div className="space-y-5">
                {CATEGORIAS_CONFIG.map((categoria) => {
                  const tiposCategoria = tiposPorCategoria[categoria.chave];
                  if (tiposCategoria.length === 0) {
                    return null;
                  }

                  return (
                    <div key={categoria.chave} className="space-y-4">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">{categoria.titulo}</h4>
                        <p className="text-sm text-gray-500">{categoria.descricao}</p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Código / Conta</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Valor</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Valor registrado</th>
                              <th className="px-3 py-2 text-center font-semibold text-gray-600">Editar / Excluir</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {tiposCategoria.map((tipo) => {
                              const valorCampo = valoresBancoSelecionado[tipo.id] ?? '';
                              const valorSalvo = valoresSalvosBancoSelecionado[tipo.id] ?? 0;
                              return (
                                <tr key={tipo.id} className="align-top">
                                  <td className="px-3 py-2 text-gray-700">
                                    <div className="font-medium text-gray-900">{tipo.codigo}</div>
                                    <div className="text-xs text-gray-500">{tipo.nome}</div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={valorCampo}
                                      onChange={(event) =>
                                        handleValorBancoChange(bancoSelecionado.id, tipo.id, event.target.value)
                                      }
                                      helperText={
                                        valorCampo
                                          ? (() => {
                                              const resultado = avaliarValor(valorCampo ?? '');
                                              return resultado !== null ? `Resultado: ${formatCurrency(resultado)}` : undefined;
                                            })()
                                          : undefined
                                      }
                                      disabled={!podeEditar}
                                      fullWidth
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                    {valorSalvo > 0 ? formatCurrency(valorSalvo) : '-'}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center justify-center gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => handlePreencherValorSalvo(bancoSelecionado.id, tipo.id)}
                                        disabled={valorSalvo <= 0 || !podeEditar}
                                      >
                                        Editar
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleValorBancoChange(bancoSelecionado.id, tipo.id, '')}
                                        disabled={valorSalvo <= 0 || !podeEditar}
                                      >
                                        Excluir
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                loading={registrando}
                disabled={!podeEditar || !bancoSelecionado || tipos.length === 0}
              >
                Salvar lançamentos do dia
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
