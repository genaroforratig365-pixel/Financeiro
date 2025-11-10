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

type TipoOption = {
  id: number;
  nome: string;
  codigo: string;
};

type CategoriaPrincipal = 'titulos' | 'depositos';

type ContaOption = {
  id: number;
  codigo: string;
  nome: string;
  bancoId: number | null;
  bancoNome: string | null;
  categoria: CategoriaPrincipal | null;
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
  total: number;
};

type ValoresTextoPorCategoria = Record<CategoriaPrincipal, Record<number, string>>;
type ValoresNumericosPorCategoria = Record<CategoriaPrincipal, Record<number, number>>;

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

const obterCategoriaConta = (codigo: string | null): CategoriaPrincipal | null => {
  const referencia = (codigo ?? '').trim();
  if (referencia.startsWith('200')) return 'titulos';
  if (referencia.startsWith('201')) return 'depositos';
  return null;
};

const criarMapaTexto = (): ValoresTextoPorCategoria => ({ titulos: {}, depositos: {} });

const criarMapaNumerico = (): ValoresNumericosPorCategoria => ({ titulos: {}, depositos: {} });

const CATEGORIAS_PRINCIPAIS: { id: CategoriaPrincipal; titulo: string; descricao: string; codigoConta: string }[] = [
  {
    id: 'titulos',
    titulo: 'Receita de títulos',
    descricao: 'Utilize a conta de receita código 200 para registrar os valores de títulos.',
    codigoConta: '200',
  },
  {
    id: 'depositos',
    titulo: 'Receita de depósitos',
    descricao: 'Informe os valores vinculados à conta de receita código 201.',
    codigoConta: '201',
  },
];

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
  const [valoresPorBanco, setValoresPorBanco] = useState<Record<number, ValoresTextoPorCategoria>>({});

  const [dataReferencia, setDataReferencia] = useState(() => toISODate(new Date()));
  const [bancoSelecionadoId, setBancoSelecionadoId] = useState<number | null>(null);

  const podeEditar = dataReferencia >= limiteRetroativo && dataReferencia <= hojeIso;

  const contasMap = useMemo(() => {
    const mapa = new Map<number, ContaOption>();
    contas.forEach((conta) => mapa.set(conta.id, conta));
    return mapa;
  }, [contas]);

  const tiposMap = useMemo(() => {
    const mapa = new Map<number, TipoOption>();
    tipos.forEach((tipo) => mapa.set(tipo.id, tipo));
    return mapa;
  }, [tipos]);

  const contasCategoriaPorBanco = useMemo(() => {
    const mapa = new Map<number, Partial<Record<CategoriaPrincipal, ContaOption>>>();
    contas.forEach((conta) => {
      if (conta.bancoId === null || !conta.categoria) return;
      const atual = mapa.get(conta.bancoId) ?? {};
      if (!atual[conta.categoria]) {
        atual[conta.categoria] = conta;
      }
      mapa.set(conta.bancoId, atual);
    });
    return mapa;
  }, [contas]);

  const tiposOrdenados = useMemo(() => {
    return [...tipos].sort((a, b) => {
      const diffCodigo = a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (diffCodigo !== 0) return diffCodigo;
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
  }, [tipos]);


  const valoresSalvosPorBanco = useMemo<Record<number, ValoresNumericosPorCategoria>>(() => {
    const base: Record<number, ValoresNumericosPorCategoria> = {};

    Object.values(lancamentosExistentes).forEach((registro) => {
      const conta = contasMap.get(registro.contaId);
      const bancoId = conta?.bancoId;
      const categoria = conta?.categoria;

      if (bancoId === null || bancoId === undefined || !categoria) {
        return;
      }

      if (!base[bancoId]) {
        base[bancoId] = criarMapaNumerico();
      }

      base[bancoId][categoria][registro.tipoId] =
        (base[bancoId][categoria][registro.tipoId] ?? 0) + registro.valor;
    });

    return base;
  }, [contasMap, lancamentosExistentes]);

  const totaisSalvosPorBanco = useMemo(() => {
    const mapa = new Map<number, number>();
    Object.entries(valoresSalvosPorBanco).forEach(([bancoId, valores]) => {
      const total = Object.values(valores).reduce((accBanco, categorias) => {
        return (
          accBanco +
          Object.values(categorias).reduce((accCategoria, valor) => accCategoria + valor, 0)
        );
      }, 0);
      mapa.set(Number(bancoId), Math.round(total * 100) / 100);
    });
    return mapa;
  }, [valoresSalvosPorBanco]);

  const resumoLancadoPorBanco = useMemo<ResumoBanco[]>(() => {
    const linhas: ResumoBanco[] = [];

    Object.entries(valoresSalvosPorBanco).forEach(([bancoIdTexto, valores]) => {
      const total = Object.values(valores).reduce((accBanco, categoriaValores) => {
        return (
          accBanco +
          Object.values(categoriaValores).reduce((accCategoria, valor) => {
            if (valor > 0 && Number.isFinite(valor)) {
              return accCategoria + valor;
            }
            return accCategoria;
          }, 0)
        );
      }, 0);

      if (total <= 0) {
        return;
      }

      const bancoId = Number(bancoIdTexto);
      const banco = bancos.find((item) => item.id === bancoId);
      linhas.push({
        bancoId,
        bancoNome: banco?.nome ?? 'Sem banco vinculado',
        total: Math.round(total * 100) / 100,
      });
    });

    return linhas.sort((a, b) => a.bancoNome.localeCompare(b.bancoNome, 'pt-BR', { sensitivity: 'base' }));
  }, [bancos, valoresSalvosPorBanco]);

  const totalLancadoPorBanco = useMemo(() => {
    return resumoLancadoPorBanco.reduce((acc, item) => acc + item.total, 0);
  }, [resumoLancadoPorBanco]);

  const resumoLancadoPorTipo = useMemo<ResumoTipo[]>(() => {
    const totais = new Map<number, number>();

    Object.values(valoresSalvosPorBanco).forEach((categoriasBanco) => {
      Object.values(categoriasBanco).forEach((tiposCategoria) => {
        Object.entries(tiposCategoria).forEach(([tipoIdTexto, valor]) => {
          if (valor <= 0 || !Number.isFinite(valor)) {
            return;
          }

          const tipoId = Number(tipoIdTexto);
          totais.set(tipoId, (totais.get(tipoId) ?? 0) + valor);
        });
      });
    });

    const linhas: ResumoTipo[] = [];

    totais.forEach((total, tipoId) => {
      const tipo = tiposMap.get(tipoId);
      if (!tipo) {
        return;
      }

      linhas.push({
        tipoId,
        nome: tipo.nome,
        codigo: tipo.codigo,
        total: Math.round(total * 100) / 100,
      });
    });

    return linhas.sort((a, b) => {
      const codigoDiff = a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (codigoDiff !== 0) {
        return codigoDiff;
      }
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
  }, [tiposMap, valoresSalvosPorBanco]);

  const totalLancadoPorTipo = useMemo(() => {
    return resumoLancadoPorTipo.reduce((acc, item) => acc + item.total, 0);
  }, [resumoLancadoPorTipo]);

  useEffect(() => {
    if (bancos.length > 0 && bancoSelecionadoId === null) {
      setBancoSelecionadoId(bancos[0].id);
    }
  }, [bancos, bancoSelecionadoId]);

  useEffect(() => {
    if (bancos.length === 0 || tiposOrdenados.length === 0) {
      return;
    }

    const novoMapa: Record<number, ValoresTextoPorCategoria> = {};
    bancos.forEach((banco) => {
      const salvosBanco = valoresSalvosPorBanco[banco.id] ?? criarMapaNumerico();
      const valores = criarMapaTexto();

      CATEGORIAS_PRINCIPAIS.forEach(({ id }) => {
        tiposOrdenados.forEach((tipo) => {
          const salvo = salvosBanco[id]?.[tipo.id] ?? 0;
          valores[id][tipo.id] = salvo > 0 ? formatarValorParaInput(salvo) : '';
        });
      });

      novoMapa[banco.id] = valores;
    });
    setValoresPorBanco(novoMapa);
  }, [bancos, tiposOrdenados, valoresSalvosPorBanco]);

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
            .select('ctr_id, ctr_nome, ctr_codigo, ctr_ban_id, ban_bancos(ban_nome)')
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
        }));

        const contasFormatadas: ContaOption[] = (contasRes.data ?? []).map((conta) => {
          const bancoRelacionado = Array.isArray(conta.ban_bancos)
            ? conta.ban_bancos[0]
            : (conta.ban_bancos as { ban_nome?: string | null } | null);
          const codigo = typeof conta.ctr_codigo === 'string' ? conta.ctr_codigo : String(conta.ctr_codigo ?? '');
          return {
            id: Number(conta.ctr_id),
            codigo,
            nome: conta.ctr_nome ?? 'Conta sem nome',
            bancoId: conta.ctr_ban_id !== null ? Number(conta.ctr_ban_id) : null,
            bancoNome: bancoRelacionado?.ban_nome ?? 'Sem banco vinculado',
            categoria: obterCategoriaConta(codigo),
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

  const handleValorBancoChange = (
    bancoId: number,
    categoria: CategoriaPrincipal,
    tipoId: number,
    valor: string,
  ) => {
    setValoresPorBanco((prev) => {
      const atual = { ...prev };
      const mapaBanco = { ...(atual[bancoId] ?? criarMapaTexto()) };
      mapaBanco[categoria] = {
        ...(mapaBanco[categoria] ?? {}),
        [tipoId]: valor,
      };
      atual[bancoId] = mapaBanco;
      return atual;
    });
  };

  const handlePreencherValorSalvo = (bancoId: number, categoria: CategoriaPrincipal, tipoId: number) => {
    const valorSalvo = valoresSalvosPorBanco[bancoId]?.[categoria]?.[tipoId] ?? 0;
    handleValorBancoChange(
      bancoId,
      categoria,
      tipoId,
      valorSalvo > 0 ? formatarValorParaInput(valorSalvo) : '',
    );
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

    const contasBanco = contasCategoriaPorBanco.get(bancoSelecionadoId) ?? {};
    const categoriasSemConta = CATEGORIAS_PRINCIPAIS.filter(({ id }) => !contasBanco[id]);

    if (categoriasSemConta.length > 0) {
      const codigosFaltantes = categoriasSemConta.map((categoria) => categoria.codigoConta).join(' e ');
      setMensagem({
        tipo: 'erro',
        texto: `Associe as contas de receita ${codigosFaltantes} ao banco selecionado antes de registrar as cobranças.`,
      });
      return;
    }

    const valoresBanco = valoresPorBanco[bancoSelecionadoId] ?? criarMapaTexto();
    const registrosParaUpsert: any[] = [];
    const idsParaExcluir: number[] = [];

    CATEGORIAS_PRINCIPAIS.forEach(({ id }) => {
      const contaCategoria = contasBanco[id];
      if (!contaCategoria) {
        return;
      }

      const valoresCategoria = valoresBanco[id] ?? {};

      tiposOrdenados.forEach((tipo) => {
        const valorEntrada = valoresCategoria[tipo.id] ?? '';
        const valorCalculado = avaliarValor(valorEntrada);
        const chave = gerarChaveLancamento(contaCategoria.id, tipo.id);
        const registroExistente = lancamentosExistentes[chave];

        if (valorCalculado !== null && valorCalculado > 0) {
          if (!registroExistente || Math.abs(valorCalculado - registroExistente.valor) > 0.009) {
            registrosParaUpsert.push({
              cob_id: registroExistente?.id,
              cob_ctr_id: contaCategoria.id,
              cob_tpr_id: tipo.id,
              cob_usr_id: usuario.usr_id,
              cob_data: dataReferencia,
              cob_valor: valorCalculado,
            });
          }
        } else if (registroExistente) {
          idsParaExcluir.push(registroExistente.id);
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

  const totaisPorCategoria = useMemo<Record<CategoriaPrincipal, number>>(() => {
    const totais: Record<CategoriaPrincipal, number> = { titulos: 0, depositos: 0 };

    if (bancoSelecionadoId === null || bancoSelecionadoId === undefined) {
      return totais;
    }

    const valores = valoresPorBanco[bancoSelecionadoId] ?? criarMapaTexto();

    CATEGORIAS_PRINCIPAIS.forEach(({ id }) => {
      const total = tiposOrdenados.reduce((acc, tipo) => {
        const resultado = avaliarValor(valores[id]?.[tipo.id] ?? '');
        if (resultado === null || !Number.isFinite(resultado)) {
          return acc;
        }
        return acc + resultado;
      }, 0);

      totais[id] = Math.round(total * 100) / 100;
    });

    return totais;
  }, [bancoSelecionadoId, tiposOrdenados, valoresPorBanco]);

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
  let valoresBancoSelecionado: ValoresTextoPorCategoria = criarMapaTexto();
  let valoresSalvosBancoSelecionado: ValoresNumericosPorCategoria = criarMapaNumerico();
  let contasBancoSelecionado: Partial<Record<CategoriaPrincipal, ContaOption>> = {};

  if (bancoSelecionadoId !== null && bancoSelecionadoId !== undefined) {
    valoresBancoSelecionado = valoresPorBanco[bancoSelecionadoId] ?? criarMapaTexto();
    valoresSalvosBancoSelecionado = valoresSalvosPorBanco[bancoSelecionadoId] ?? criarMapaNumerico();
    contasBancoSelecionado = contasCategoriaPorBanco.get(bancoSelecionadoId) ?? {};
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

            <div className="rounded-md border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800">
              Limite de edição
              <div className="mt-1 text-xs text-primary-700">
                Os lançamentos podem ser criados ou ajustados até 7 dias retroativos em relação a {formatarDataPt(hojeIso)}.
              </div>
              <div className="mt-1 text-xs text-primary-700">
                Intervalo permitido: {formatarDataPt(limiteRetroativo)} até {formatarDataPt(hojeIso)}.
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h3 className="text-base font-semibold text-gray-900">Totais lançados por banco</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Visualize apenas os bancos que possuem valores já registrados nas cobranças.
                  </p>
                </div>
                <div className="px-4 py-3">
                  {resumoLancadoPorBanco.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum lançamento registrado para os bancos disponíveis.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600">Banco</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-600">Valor lançado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {resumoLancadoPorBanco.map((resumo) => (
                            <tr key={`resumo-banco-${resumo.bancoId ?? 'sem-banco'}`}>
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
                              {formatCurrency(totalLancadoPorBanco)}
                            </th>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h3 className="text-base font-semibold text-gray-900">Totais lançados por tipo</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Consulte apenas os tipos de receita que já possuem valores confirmados.
                  </p>
                </div>
                <div className="px-4 py-3">
                  {resumoLancadoPorTipo.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum tipo de receita possui lançamentos registrados.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600">Tipo de receita</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-600">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {resumoLancadoPorTipo.map((linha) => (
                            <tr key={`resumo-tipo-${linha.tipoId}`}>
                              <td className="px-3 py-2 text-gray-700">
                                <div className="font-semibold text-gray-900">{linha.nome}</div>
                                <div className="text-xs text-gray-500">Código: {linha.codigo}</div>
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-gray-900">
                                {formatCurrency(linha.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Total geral</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-900">
                              {formatCurrency(totalLancadoPorTipo)}
                            </th>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
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
            ) : bancos.length === 0 || tiposOrdenados.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                Cadastre bancos ativos, contas e tipos de receita para habilitar os lançamentos de cobrança.
              </div>
            ) : !bancoSelecionado ? (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                Escolha um banco para visualizar as contas de receita disponíveis.
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-1">
                {CATEGORIAS_PRINCIPAIS.map((categoria) => {
                  const contaCategoria = contasBancoSelecionado[categoria.id] ?? null;
                  const valoresCategoria = valoresBancoSelecionado[categoria.id] ?? {};
                  const valoresSalvosCategoria = valoresSalvosBancoSelecionado[categoria.id] ?? {};
                  const totalCategoria = totaisPorCategoria[categoria.id];

                  return (
                    <div
                      key={categoria.id}
                      className="min-w-[600px] flex-1 rounded-lg border border-gray-200 bg-white shadow-sm"
                    >
                      <div className="border-b border-gray-200 px-4 py-3">
                        <h3 className="text-base font-semibold text-gray-900">{categoria.titulo}</h3>
                        <p className="mt-1 text-xs text-gray-500">{categoria.descricao}</p>
                        {contaCategoria ? (
                          <p className="mt-1 text-xs text-gray-500">
                            Conta vinculada: {contaCategoria.codigo} - {contaCategoria.nome}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs font-medium text-error-600">
                            Vincule a conta {categoria.codigoConta} a este banco para habilitar os lançamentos.
                          </p>
                        )}
                      </div>
                      <div className="px-4 py-3">
                        {contaCategoria ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full table-fixed divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                                    Código / Tipo
                                  </th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                                    Valor informado
                                  </th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                                    Valor registrado
                                  </th>
                                  <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">
                                    Ações
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {tiposOrdenados.map((tipo) => {
                                  const valorCampo = valoresCategoria[tipo.id] ?? '';
                                  const valorSalvo = valoresSalvosCategoria[tipo.id] ?? 0;
                                  return (
                                    <tr key={`${categoria.id}-${tipo.id}`} className="align-middle">
                                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                        <span className="font-semibold text-gray-900">
                                          {`${tipo.codigo} - ${tipo.nome}`}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="w-48">
                                          <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={valorCampo}
                                            onChange={(event) =>
                                              handleValorBancoChange(
                                                bancoSelecionado.id,
                                                categoria.id,
                                                tipo.id,
                                                event.target.value,
                                              )
                                            }
                                            helperText={
                                              valorCampo
                                                ? (() => {
                                                    const resultado = avaliarValor(valorCampo ?? '');
                                                    return resultado !== null
                                                      ? `Resultado: ${formatCurrency(resultado)}`
                                                      : undefined;
                                                  })()
                                                : undefined
                                            }
                                            disabled={!podeEditar}
                                          />
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                                        {valorSalvo > 0 ? formatCurrency(valorSalvo) : '-'}
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center justify-center gap-2">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() =>
                                              handlePreencherValorSalvo(
                                                bancoSelecionado.id,
                                                categoria.id,
                                                tipo.id,
                                              )
                                            }
                                            disabled={valorSalvo <= 0 || !podeEditar}
                                          >
                                            Editar
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                              handleValorBancoChange(
                                                bancoSelecionado.id,
                                                categoria.id,
                                                tipo.id,
                                                '',
                                              )
                                            }
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
                              <tfoot className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                                    Total informado
                                  </th>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                                    {formatCurrency(totalCategoria)}
                                  </td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed border-error-200 bg-error-50 px-4 py-6 text-center text-sm text-error-700">
                            Cadastre a conta de receita código {categoria.codigoConta} para este banco e recarregue a página.
                          </div>
                        )}
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
