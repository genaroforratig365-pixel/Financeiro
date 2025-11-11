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

type ContaOption = {
  id: number;
  codigo: string;
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
  bancoId: number;
  contaId: number;
  tipoId: number;
  valor: number;
  usrId: string;
};

type ValoresTextoPorTipo = Record<number, string>;
type ValoresTextoPorConta = Record<number, ValoresTextoPorTipo>;
type ValoresTextoPorBanco = Record<number, ValoresTextoPorConta>;

type ValoresNumericosPorTipo = Record<number, number>;
type ValoresNumericosPorConta = Record<number, ValoresNumericosPorTipo>;
type ValoresNumericosPorBanco = Record<number, ValoresNumericosPorConta>;

type ResumoBanco = { bancoId: number | null; bancoNome: string; total: number };

type ResumoTipo = {
  tipoId: number;
  nome: string;
  codigo: string;
  total: number;
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

const formatarNumeroEmTempoReal = (valor: string): string => {
  // Se contém operadores matemáticos, mantém como está para permitir cálculos
  if (/[+\-*/()]/.test(valor)) {
    return valor;
  }

  // Remove tudo que não é número
  const apenasNumeros = valor.replace(/\D/g, '');

  if (!apenasNumeros) return '';

  // Converte para número (em centavos)
  const numero = parseInt(apenasNumeros, 10);

  // Divide por 100 para ter centavos
  const valorDecimal = numero / 100;

  // Formata com separadores
  return valorDecimal.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const gerarChaveLancamento = (bancoId: number, contaId: number, tipoId: number) =>
  `${bancoId}-${contaId}-${tipoId}`;

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

const normalizarCodigoConta = (codigo: string): string => {
  const apenasNumeros = (codigo ?? '').replace(/[^0-9]/g, '');
  if (apenasNumeros.length >= 3) {
    return apenasNumeros.slice(0, 3);
  }
  if (apenasNumeros.length === 0) {
    return '';
  }
  return apenasNumeros.padStart(3, '0');
};

const INFORMACOES_CONTA: Record<
  string,
  { titulo: string }
> = {
  '200': {
    titulo: 'Títulos — registrar como conta de receita 200',
  },
  '201': {
    titulo: 'Depósitos e PIX — registrar como conta de receita 201',
  },
};

const obterDescricaoConta = (conta: ContaOption) => {
  const codigoNormalizado = normalizarCodigoConta(conta.codigo);
  const info = INFORMACOES_CONTA[codigoNormalizado];
  if (info) {
    return info;
  }
  return {
    titulo: `Conta de receita ${conta.codigo} — ${conta.nome}`,
  };
};

const gerarMapaTextoInicial = (
  contasLista: ContaOption[],
  tiposLista: TipoOption[],
  registros: Record<string, LancamentoExistente>,
): ValoresTextoPorBanco => {
  // Retorna sempre vazio - campos devem vir vazios mesmo com valores salvos
  // Os valores salvos são mostrados apenas na coluna "Salvo"
  return {};
};

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

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
  const [valoresPorBanco, setValoresPorBanco] = useState<ValoresTextoPorBanco>({});

  const [dataReferencia, setDataReferencia] = useState(() => toISODate(new Date()));
  const [bancoSelecionadoId, setBancoSelecionadoId] = useState<number | null>(null);
  const [previsaoDia, setPrevisaoDia] = useState<{ previstoReceitas: number; previstoTitulos: number } | null>(null);
  const [camposEditando, setCamposEditando] = useState<Set<string>>(new Set());
  const [itensMarcadosExclusao, setItensMarcadosExclusao] = useState<Set<string>>(new Set());
  const [mostrarModalExclusao, setMostrarModalExclusao] = useState(false);

  const podeEditar = dataReferencia >= limiteRetroativo && dataReferencia <= hojeIso;

  const contasMap = useMemo(() => {
    const mapa = new Map<number, ContaOption>();
    contas.forEach((conta) => mapa.set(conta.id, conta));
    return mapa;
  }, [contas]);

  const contasRelevantes = useMemo(() => {
    const filtradas = contas.filter((conta) => {
      const codigo = normalizarCodigoConta(conta.codigo);
      return codigo === '200' || codigo === '201';
    });

    return filtradas.sort((a, b) => {
      const diffCodigo = normalizarCodigoConta(a.codigo).localeCompare(
        normalizarCodigoConta(b.codigo),
        'pt-BR',
        { numeric: true, sensitivity: 'base' },
      );
      if (diffCodigo !== 0) {
        return diffCodigo;
      }
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
  }, [contas]);

  const codigosContasDisponiveis = useMemo(() => {
    const conjunto = new Set<string>();
    contasRelevantes.forEach((conta) => {
      const codigo = normalizarCodigoConta(conta.codigo);
      if (codigo) {
        conjunto.add(codigo);
      }
    });
    return conjunto;
  }, [contasRelevantes]);

  const faltantesObrigatorios = useMemo(() => {
    const obrigatorios = ['200', '201'];
    return obrigatorios.filter((codigo) => !codigosContasDisponiveis.has(codigo));
  }, [codigosContasDisponiveis]);

  const tiposMap = useMemo(() => {
    const mapa = new Map<number, TipoOption>();
    tipos.forEach((tipo) => mapa.set(tipo.id, tipo));
    return mapa;
  }, [tipos]);

  const tiposOrdenados = useMemo(() => {
    const filtrados = tipos.filter((tipo) => {
      const codigoNormalizado = (tipo.codigo ?? '').replace(/[^0-9]/g, '');
      if (!codigoNormalizado) {
        return true;
      }
      const numerico = Number(codigoNormalizado);
      if (!Number.isFinite(numerico)) {
        return true;
      }
      return numerico >= 300;
    });

    return filtrados.sort((a, b) => {
      const diffCodigo = a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (diffCodigo !== 0) return diffCodigo;
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
  }, [tipos]);

  const valoresSalvosPorBanco = useMemo<ValoresNumericosPorBanco>(() => {
    const base: ValoresNumericosPorBanco = {};

    Object.values(lancamentosExistentes).forEach((registro) => {
      const bancoId = registro.bancoId;

      if (!base[bancoId]) {
        base[bancoId] = {};
      }

      if (!base[bancoId][registro.contaId]) {
        base[bancoId][registro.contaId] = {};
      }

      base[bancoId][registro.contaId][registro.tipoId] = arredondar(registro.valor);
    });

    return base;
  }, [lancamentosExistentes]);

  const resumoFormularioPorBanco = useMemo<ResumoBanco[]>(() => {
    const linhas: ResumoBanco[] = [];

    Object.entries(valoresPorBanco).forEach(([bancoIdTexto, contasValores]) => {
      const total = Object.values(contasValores).reduce((accConta, tiposValores) => {
        const subtotal = Object.values(tiposValores).reduce((accTipo, valorTexto) => {
          const resultado = avaliarValor(valorTexto);
          if (resultado === null || !Number.isFinite(resultado) || resultado <= 0) {
            return accTipo;
          }
          return accTipo + resultado;
        }, 0);
        return accConta + subtotal;
      }, 0);

      if (total <= 0) {
        return;
      }

      const bancoId = Number(bancoIdTexto);
      const banco = bancos.find((item) => item.id === bancoId);
      linhas.push({
        bancoId,
        bancoNome: banco?.nome ?? 'Banco não identificado',
        total: arredondar(total),
      });
    });

    return linhas.sort((a, b) => a.bancoNome.localeCompare(b.bancoNome, 'pt-BR', { sensitivity: 'base' }));
  }, [bancos, valoresPorBanco]);

  const totalFormulario = useMemo(() => {
    return resumoFormularioPorBanco.reduce((acc, item) => acc + item.total, 0);
  }, [resumoFormularioPorBanco]);

  const resumoTiposFormulario = useMemo<ResumoTipo[]>(() => {
    const totais = new Map<number, number>();

    Object.values(valoresPorBanco).forEach((contasValores) => {
      Object.values(contasValores).forEach((tiposValores) => {
        Object.entries(tiposValores).forEach(([tipoIdTexto, valorTexto]) => {
          const valorCalculado = avaliarValor(valorTexto);
          if (valorCalculado === null || !Number.isFinite(valorCalculado) || valorCalculado <= 0) {
            return;
          }
          const tipoId = Number(tipoIdTexto);
          totais.set(tipoId, (totais.get(tipoId) ?? 0) + valorCalculado);
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
        total: arredondar(total),
      });
    });

    return linhas.sort((a, b) => {
      const diffCodigo = a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (diffCodigo !== 0) {
        return diffCodigo;
      }
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
  }, [tiposMap, valoresPorBanco]);

  const totalResumoTiposFormulario = useMemo(() => {
    return resumoTiposFormulario.reduce((acc, item) => acc + item.total, 0);
  }, [resumoTiposFormulario]);

  const resumoLancadoPorBanco = useMemo<ResumoBanco[]>(() => {
    const linhas: ResumoBanco[] = [];

    Object.entries(valoresSalvosPorBanco).forEach(([bancoIdTexto, contasValores]) => {
      const total = Object.values(contasValores).reduce((accConta, tiposValores) => {
        const subtotal = Object.values(tiposValores).reduce((accTipo, valor) => {
          if (valor <= 0 || !Number.isFinite(valor)) {
            return accTipo;
          }
          return accTipo + valor;
        }, 0);
        return accConta + subtotal;
      }, 0);

      if (total <= 0) {
        return;
      }

      const chaveBanco = Number(bancoIdTexto);
      const bancoId = chaveBanco === -1 ? null : chaveBanco;
      const banco = bancoId !== null ? bancos.find((item) => item.id === bancoId) : null;
      linhas.push({
        bancoId,
        bancoNome: banco?.nome ?? 'Sem banco vinculado',
        total: arredondar(total),
      });
    });

    return linhas.sort((a, b) => a.bancoNome.localeCompare(b.bancoNome, 'pt-BR', { sensitivity: 'base' }));
  }, [bancos, valoresSalvosPorBanco]);

  const totalLancadoPorBanco = useMemo(() => {
    return resumoLancadoPorBanco.reduce((acc, item) => acc + item.total, 0);
  }, [resumoLancadoPorBanco]);

  const resumoLancadoPorTipo = useMemo<ResumoTipo[]>(() => {
    const totais = new Map<number, number>();

    Object.values(valoresSalvosPorBanco).forEach((contasValores) => {
      Object.values(contasValores).forEach((tiposValores) => {
        Object.entries(tiposValores).forEach(([tipoIdTexto, valor]) => {
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
        total: arredondar(total),
      });
    });

    return linhas.sort((a, b) => {
      const diffCodigo = a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (diffCodigo !== 0) {
        return diffCodigo;
      }
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
  }, [tiposMap, valoresSalvosPorBanco]);

  const totalLancadoPorTipo = useMemo(() => {
    return resumoLancadoPorTipo.reduce((acc, item) => acc + item.total, 0);
  }, [resumoLancadoPorTipo]);

  // Total apenas de código 301 (Receita Prevista) para o card de comparação
  const totalLancadoPorTipo301 = useMemo(() => {
    return resumoLancadoPorTipo
      .filter(item => item.codigo.startsWith('301'))
      .reduce((acc, item) => acc + item.total, 0);
  }, [resumoLancadoPorTipo]);

  const carregarLancamentosDia = useCallback(
    async (
      usuarioAtual: UsuarioRow,
      data: string,
      contasLista?: ContaOption[],
      tiposLista?: TipoOption[],
    ) => {
      try {
        setCarregandoLancamentos(true);
        const supabase = getSupabaseClient();
        // Todos os usuários podem visualizar todos os lançamentos
        const { data: registros, error } = await supabase
          .from('cob_cobrancas')
          .select('cob_id, cob_ban_id, cob_ctr_id, cob_tpr_id, cob_valor, cob_usr_id')
          .eq('cob_data', data);

        if (error) throw error;

        const mapa: Record<string, LancamentoExistente> = {};
        (registros ?? []).forEach((registro) => {
          const bancoId = Number(registro.cob_ban_id);
          const contaId = Number(registro.cob_ctr_id);
          const tipoId = Number(registro.cob_tpr_id);
          const usrId = String(registro.cob_usr_id ?? '');
          if (!Number.isFinite(bancoId) || !Number.isFinite(contaId) || !Number.isFinite(tipoId)) {
            return;
          }
          const chave = gerarChaveLancamento(bancoId, contaId, tipoId);
          mapa[chave] = {
            id: Number(registro.cob_id),
            bancoId,
            contaId,
            tipoId,
            valor: Number(registro.cob_valor ?? 0),
            usrId,
          };
        });

        setLancamentosExistentes(mapa);

        const contasBase = contasLista ?? contas;
        const tiposBase = tiposLista ?? tipos;
        if (contasBase.length > 0 && tiposBase.length > 0) {
          setValoresPorBanco(gerarMapaTextoInicial(contasBase, tiposBase, mapa));
        } else {
          setValoresPorBanco({});
        }
      } catch (error) {
        console.error('Erro ao carregar lançamentos de cobrança do dia:', error);
        setLancamentosExistentes({});
        setValoresPorBanco({});
      } finally {
        setCarregandoLancamentos(false);
      }
    },
    [contas, tipos],
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
            bancoNome: bancoRelacionado?.ban_nome ?? null,
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

        await carregarLancamentosDia(usuarioEncontrado, dataReferencia, contasFormatadas, tiposFormatados);
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
  }, [dataReferencia]);

  useEffect(() => {
    if (bancos.length > 0 && bancoSelecionadoId === null) {
      setBancoSelecionadoId(bancos[0].id);
    }
  }, [bancos, bancoSelecionadoId]);

  // Buscar valores previstos do dia
  useEffect(() => {
    if (!dataReferencia) return;

    const buscarPrevisaoDia = async () => {
      try {
        const supabase = getSupabaseClient();

        // Buscar previsões de receita do dia
        const { data, error } = await supabase
          .from('pvi_previsao_itens')
          .select('pvi_tipo, pvi_valor')
          .eq('pvi_data', dataReferencia)
          .eq('pvi_tipo', 'receita');

        if (error) throw error;

        const totalPrevisto = (data || []).reduce((sum, item) => sum + (Number(item.pvi_valor) || 0), 0);

        setPrevisaoDia({
          previstoReceitas: totalPrevisto,
          previstoTitulos: totalPrevisto // Por enquanto, mesmo valor
        });
      } catch (erro) {
        console.error('Erro ao buscar previsão do dia:', erro);
      }
    };

    buscarPrevisaoDia();
  }, [dataReferencia]);

  const handleValorBancoChange = (
    bancoId: number,
    contaId: number,
    tipoId: number,
    valor: string,
  ) => {
    // Aplica formatação em tempo real
    const valorFormatado = formatarNumeroEmTempoReal(valor);

    setValoresPorBanco((prev) => {
      const proximo: ValoresTextoPorBanco = { ...prev };
      const mapaBanco = { ...(proximo[bancoId] ?? {}) };
      const mapaConta = { ...(mapaBanco[contaId] ?? {}) };
      mapaConta[tipoId] = valorFormatado;
      mapaBanco[contaId] = mapaConta;
      proximo[bancoId] = mapaBanco;
      return proximo;
    });
  };

  const handleExcluirMovimento = async (bancoId: number, contaId: number, tipoId: number) => {
    if (!usuario || !podeEditar) {
      return;
    }

    try {
      const chave = gerarChaveLancamento(bancoId, contaId, tipoId);
      const registroExistente = lancamentosExistentes[chave];

      // Limpa o campo digitado
      handleValorBancoChange(bancoId, contaId, tipoId, '');

      // Se existe registro salvo, deleta do banco
      if (registroExistente) {
        const supabase = getSupabaseClient();
        const { error } = await supabase
          .from('cob_cobrancas')
          .delete()
          .eq('cob_id', registroExistente.id);

        if (error) throw error;

        setMensagem({
          tipo: 'sucesso',
          texto: 'Movimento excluído com sucesso.',
        });

        // Recarrega os lançamentos
        await carregarLancamentosDia(usuario, dataReferencia);
      }
    } catch (error) {
      console.error('Erro ao excluir movimento:', error);
      setMensagem({
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível excluir o movimento. Tente novamente.',
        ),
      });
    }
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

    if (contasRelevantes.length === 0) {
      setMensagem({
        tipo: 'erro',
        texto: 'Cadastre as contas de receita 200 e 201 antes de registrar as cobranças.',
      });
      return;
    }

    const usuarioId = usuario.usr_id;
    if (!usuarioId || usuarioId.trim().length === 0) {
      setMensagem({
        tipo: 'erro',
        texto: 'Não foi possível identificar o usuário responsável pelo lançamento.',
      });
      return;
    }

    const registrosParaInserir: Array<{
      cob_ban_id: number;
      cob_ctr_id: number;
      cob_tpr_id: number;
      cob_usr_id: string;
      cob_data: string;
      cob_valor: number;
    }> = [];

    // Iterar sobre TODOS os bancos, mas APENAS inserir valores NOVOS (sem registro existente)
    Object.keys(valoresPorBanco).forEach((bancoIdStr) => {
      const bancoId = Number(bancoIdStr);
      const valoresBanco = valoresPorBanco[bancoId];

      contasRelevantes.forEach((conta) => {
        const valoresConta = valoresBanco[conta.id] ?? {};

        tiposOrdenados.forEach((tipo) => {
          const valorEntrada = valoresConta[tipo.id] ?? '';
          const valorCalculado = avaliarValor(valorEntrada);
          const chave = gerarChaveLancamento(bancoId, conta.id, tipo.id);
          const registroExistente = lancamentosExistentes[chave];

          // APENAS inserir se: tem valor digitado E não existe registro salvo E não está editando
          if (
            valorCalculado !== null &&
            valorCalculado > 0 &&
            !registroExistente &&
            !camposEditando.has(chave)
          ) {
            registrosParaInserir.push({
              cob_ban_id: bancoId,
              cob_ctr_id: conta.id,
              cob_tpr_id: tipo.id,
              cob_usr_id: usuarioId,
              cob_data: dataReferencia,
              cob_valor: valorCalculado,
            });
          }
        });
      });
    });

    if (registrosParaInserir.length === 0) {
      setMensagem({
        tipo: 'info',
        texto: 'Nenhum novo lançamento para salvar.',
      });
      return;
    }

    try {
      setRegistrando(true);
      setMensagem(null);
      const supabase = getSupabaseClient();

      const { error } = await supabase.from('cob_cobrancas').insert(registrosParaInserir);
      if (error) throw error;

      setMensagem({
        tipo: 'sucesso',
        texto: `${registrosParaInserir.length} novo(s) lançamento(s) salvo(s) com sucesso.`,
      });

      // Recarrega lançamentos do dia
      await carregarLancamentosDia(usuario, dataReferencia);
    } catch (error) {
      console.error('Erro ao salvar lançamentos:', error);
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

  const handleSalvarEdicao = async (bancoId: number, contaId: number, tipoId: number) => {
    if (!usuario || !podeEditar) return;

    const valorEntrada = valoresPorBanco[bancoId]?.[contaId]?.[tipoId] ?? '';
    const valorCalculado = avaliarValor(valorEntrada);
    const chave = gerarChaveLancamento(bancoId, contaId, tipoId);
    const registroExistente = lancamentosExistentes[chave];

    if (!registroExistente) {
      setMensagem({ tipo: 'erro', texto: 'Registro não encontrado.' });
      return;
    }

    if (valorCalculado === null || valorCalculado <= 0) {
      setMensagem({ tipo: 'erro', texto: 'Informe um valor válido.' });
      return;
    }

    try {
      setRegistrando(true);
      setMensagem(null);
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('cob_cobrancas')
        .update({ cob_valor: valorCalculado })
        .eq('cob_id', registroExistente.id);

      if (error) throw error;

      setMensagem({ tipo: 'sucesso', texto: 'Valor atualizado com sucesso.' });

      // Remove do modo edição
      const novoSet = new Set(camposEditando);
      novoSet.delete(chave);
      setCamposEditando(novoSet);

      // Recarrega
      await carregarLancamentosDia(usuario, dataReferencia);
    } catch (erro) {
      console.error('Erro ao atualizar:', erro);
      setMensagem({ tipo: 'erro', texto: 'Erro ao atualizar valor.' });
    } finally {
      setRegistrando(false);
    }
  };

  const handleAbrirModalExclusao = () => {
    if (!usuario || !podeEditar || itensMarcadosExclusao.size === 0) return;
    setMostrarModalExclusao(true);
  };

  const handleConfirmarExclusao = async () => {
    if (!usuario || !podeEditar) return;

    try {
      setRegistrando(true);
      setMensagem(null);
      setMostrarModalExclusao(false);
      const supabase = getSupabaseClient();
      const idsParaExcluir: number[] = [];

      itensMarcadosExclusao.forEach((chave) => {
        const registro = lancamentosExistentes[chave];
        if (registro) {
          idsParaExcluir.push(registro.id);
        }
      });

      if (idsParaExcluir.length === 0) {
        setMensagem({ tipo: 'info', texto: 'Nenhum registro para excluir.' });
        return;
      }

      const { error } = await supabase
        .from('cob_cobrancas')
        .delete()
        .in('cob_id', idsParaExcluir);

      if (error) throw error;

      setMensagem({
        tipo: 'sucesso',
        texto: `${idsParaExcluir.length} lançamento(s) excluído(s) com sucesso.`,
      });

      // Limpa seleção
      setItensMarcadosExclusao(new Set());

      // Recarrega
      await carregarLancamentosDia(usuario, dataReferencia);
    } catch (erro) {
      console.error('Erro ao excluir:', erro);
      setMensagem({ tipo: 'erro', texto: 'Erro ao excluir lançamentos.' });
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

  let valoresBancoSelecionado: ValoresTextoPorConta = {};
  let valoresSalvosBancoSelecionado: ValoresNumericosPorConta = {};

  if (bancoSelecionadoId !== null) {
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
            {/* Seleção de data no topo */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Data de registro da movimentação
                <input
                  type="date"
                  className="mt-1 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              <div className="rounded-md border border-dashed border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-700">
                <div className="font-medium text-primary-800">Limite de edição</div>
                <div className="mt-1">
                  Os lançamentos podem ser criados ou ajustados até 7 dias retroativos em relação a {formatarDataPt(hojeIso)}.
                </div>
                <div className="mt-1">
                  Intervalo permitido: {formatarDataPt(limiteRetroativo)} até {formatarDataPt(hojeIso)}.
                </div>
              </div>
            </div>

            {/* Dois cards de resumo lado a lado - atualiza em tempo real conforme digitação */}
            {(resumoFormularioPorBanco.length > 0 || resumoTiposFormulario.length > 0 || resumoLancadoPorBanco.length > 0 || resumoLancadoPorTipo.length > 0) && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-red-200 bg-red-50 px-4 py-3">
                    <h3 className="text-base font-semibold text-red-800">🔴 Resumo por banco</h3>
                    <p className="mt-1 text-xs text-red-600">
                      Valores digitados e salvos por banco
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    {resumoFormularioPorBanco.length === 0 && resumoLancadoPorBanco.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhum valor informado</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Banco</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Digitado</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Salvo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {Array.from(new Set([
                              ...resumoFormularioPorBanco.map(r => r.bancoId),
                              ...resumoLancadoPorBanco.map(r => r.bancoId)
                            ])).map((bancoId) => {
                              const form = resumoFormularioPorBanco.find(r => r.bancoId === bancoId);
                              const salvo = resumoLancadoPorBanco.find(r => r.bancoId === bancoId);
                              const nome = form?.bancoNome || salvo?.bancoNome || 'Banco não identificado';
                              return (
                                <tr key={`resumo-banco-${bancoId}`}>
                                  <td className="px-3 py-2 text-gray-700">{nome}</td>
                                  <td className="px-3 py-2 text-right font-medium text-primary-700">
                                    {form ? formatCurrency(form.total) : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                                    {salvo ? formatCurrency(salvo.total) : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-700">Total</th>
                              <th className="px-3 py-2 text-right font-semibold text-primary-800">
                                {formatCurrency(totalFormulario)}
                              </th>
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
                  <div className="border-b border-red-200 bg-red-50 px-4 py-3">
                    <h3 className="text-base font-semibold text-red-800">🔴 Resumo por tipo de receita</h3>
                    <p className="mt-1 text-xs text-red-600">
                      Valores digitados e salvos por tipo de receita
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    {resumoTiposFormulario.length === 0 && resumoLancadoPorTipo.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhum valor informado</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Tipo de receita</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Digitado</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Salvo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {Array.from(new Set([
                              ...resumoTiposFormulario.map(r => r.tipoId),
                              ...resumoLancadoPorTipo.map(r => r.tipoId)
                            ])).map((tipoId) => {
                              const form = resumoTiposFormulario.find(r => r.tipoId === tipoId);
                              const salvo = resumoLancadoPorTipo.find(r => r.tipoId === tipoId);
                              const nome = form?.nome || salvo?.nome || 'Tipo não identificado';
                              const codigo = form?.codigo || salvo?.codigo || '';
                              return (
                                <tr key={`resumo-tipo-${tipoId}`}>
                                  <td className="px-3 py-2 text-gray-700">
                                    <div className="font-semibold text-gray-900">{nome}</div>
                                    <div className="text-xs text-gray-500">Código: {codigo}</div>
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-primary-700">
                                    {form ? formatCurrency(form.total) : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                                    {salvo ? formatCurrency(salvo.total) : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-700">Total</th>
                              <th className="px-3 py-2 text-right font-semibold text-primary-800">
                                {formatCurrency(totalResumoTiposFormulario)}
                              </th>
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
            )}

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

            {/* Card Previsto vs Realizado do Dia */}
            {previsaoDia && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-semibold text-gray-900 mb-4">
                  Previsão vs Realização do Dia
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  {/* Coluna 1: Previsto */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600 uppercase">Previsto</p>
                    <p className="text-2xl font-bold text-primary-700">
                      {formatCurrency(previsaoDia.previstoReceitas)}
                    </p>
                    <p className="text-xs text-gray-500">Receitas previstas</p>
                  </div>

                  {/* Coluna 2: Realizado */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600 uppercase">Realizado</p>
                    <p className="text-2xl font-bold text-success-700">
                      {formatCurrency(totalLancadoPorTipo301)}
                    </p>
                    <p className="text-xs text-gray-500">Receitas realizadas (código 301)</p>
                  </div>

                  {/* Coluna 3: Percentual */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600 uppercase">% Realizado</p>
                    <p className={`text-2xl font-bold ${
                      previsaoDia.previstoReceitas > 0 && totalLancadoPorTipo301 >= previsaoDia.previstoReceitas
                        ? 'text-success-700'
                        : 'text-warning-700'
                    }`}>
                      {previsaoDia.previstoReceitas > 0
                        ? `${((totalLancadoPorTipo301 / previsaoDia.previstoReceitas) * 100).toFixed(1)}%`
                        : '-'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {previsaoDia.previstoReceitas > 0 && totalLancadoPorTipo301 < previsaoDia.previstoReceitas
                        ? `Faltam ${formatCurrency(previsaoDia.previstoReceitas - totalLancadoPorTipo301)}`
                        : previsaoDia.previstoReceitas > 0 && totalLancadoPorTipo301 > previsaoDia.previstoReceitas
                        ? `Excedeu ${formatCurrency(totalLancadoPorTipo301 - previsaoDia.previstoReceitas)}`
                        : 'Meta atingida'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Seletor de banco */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-gray-900">Seleção do banco</h3>
                <p className="text-sm text-gray-500">
                  Selecione o banco para registrar os lançamentos. Todos os bancos cadastrados na tabela <strong>ban_bancos</strong> estão listados abaixo.
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Banco
                  <select
                    className="mt-1 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                </label>
              </div>
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
                Escolha um banco para visualizar as contas de lançamento disponíveis.
              </div>
            ) : contasRelevantes.length === 0 ? (
              <div className="rounded-md border border-warning-200 bg-warning-50 px-4 py-6 text-center text-sm text-warning-800">
                Cadastre as contas de receita 200 e 201 para habilitar os lançamentos de cobrança.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {contasRelevantes.map((conta) => {
                    const descricaoConta = obterDescricaoConta(conta);
                    const valoresContaSelecionada = valoresBancoSelecionado[conta.id] ?? {};
                    const totalConta = Object.values(valoresContaSelecionada).reduce((acc, valorTexto) => {
                      const calculado = avaliarValor(valorTexto);
                      if (calculado === null || !Number.isFinite(calculado) || calculado <= 0) {
                        return acc;
                      }
                      return acc + calculado;
                    }, 0);

                    const totalContaArredondado = arredondar(totalConta);

                    return (
                      <div key={`conta-${conta.id}`} className="rounded-lg border border-gray-200 bg-white shadow-sm">
                        <div className="border-b border-gray-200 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h3 className="text-base font-semibold text-gray-900">{descricaoConta.titulo}</h3>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <div>Conta: {conta.nome}</div>
                              <div>Código: {conta.codigo}</div>
                            </div>
                          </div>
                        </div>
                        <div className="px-4 py-3">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Tipo de receita</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Valor</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Valor registrado</th>
                                  <th className="px-3 py-2 text-center font-semibold text-gray-600">Excluir / Editar</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {tiposOrdenados.map((tipo) => {
                                  const valorCampo = valoresContaSelecionada[tipo.id] ?? '';
                                  const valorSalvo = valoresSalvosBancoSelecionado[conta.id]?.[tipo.id] ?? 0;
                                  const chave = gerarChaveLancamento(bancoSelecionado.id, conta.id, tipo.id);
                                  const estaEditando = camposEditando.has(chave);
                                  const estaMarcadoExclusao = itensMarcadosExclusao.has(chave);
                                  const campoDesabilitado = !podeEditar || (valorSalvo > 0 && !estaEditando);

                                  return (
                                    <tr key={`conta-${conta.id}-tipo-${tipo.id}`} className="align-top">
                                      <td className="px-3 py-2 text-gray-700">
                                        <div className="text-sm font-semibold text-gray-900">{tipo.nome}</div>
                                        <div className="text-xs text-gray-500">Código: {tipo.codigo}</div>
                                      </td>
                                      <td className="px-3 py-2">
                                        <Input
                                          type="text"
                                          inputMode="decimal"
                                          value={valorCampo}
                                          onChange={(event) =>
                                            handleValorBancoChange(
                                              bancoSelecionado.id,
                                              conta.id,
                                              tipo.id,
                                              event.target.value,
                                            )
                                          }
                                          onKeyDown={(event) => {
                                            // Enter, Tab e Seta para baixo movem para próximo campo
                                            if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'Tab') {
                                              event.preventDefault();
                                              const inputs = Array.from(
                                                document.querySelectorAll('input[type="text"]:not([disabled])')
                                              ) as HTMLInputElement[];
                                              const currentIndex = inputs.indexOf(event.currentTarget as HTMLInputElement);
                                              if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
                                                inputs[currentIndex + 1].focus();
                                              }
                                            }
                                            // Seta para cima move para campo anterior
                                            if (event.key === 'ArrowUp') {
                                              event.preventDefault();
                                              const inputs = Array.from(
                                                document.querySelectorAll('input[type="text"]:not([disabled])')
                                              ) as HTMLInputElement[];
                                              const currentIndex = inputs.indexOf(event.currentTarget as HTMLInputElement);
                                              if (currentIndex > 0) {
                                                inputs[currentIndex - 1].focus();
                                              }
                                            }
                                          }}
                                          disabled={campoDesabilitado}
                                          fullWidth
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        {valorSalvo > 0 ? (
                                          <div className="flex items-center justify-end gap-2">
                                            <span className="font-semibold text-gray-900">{formatCurrency(valorSalvo)}</span>
                                          </div>
                                        ) : (
                                          <span className="text-gray-400">-</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center justify-center gap-2">
                                          {/* Checkbox de exclusão */}
                                          {valorSalvo > 0 && !estaEditando && (
                                            <input
                                              type="checkbox"
                                              checked={estaMarcadoExclusao}
                                              onChange={(e) => {
                                                const novoSet = new Set(itensMarcadosExclusao);
                                                if (e.target.checked) {
                                                  novoSet.add(chave);
                                                } else {
                                                  novoSet.delete(chave);
                                                }
                                                setItensMarcadosExclusao(novoSet);
                                              }}
                                              disabled={!podeEditar}
                                              className="rounded border-gray-300"
                                              title="Marcar para exclusão"
                                            />
                                          )}

                                          {/* Botão Editar */}
                                          {valorSalvo > 0 && !estaEditando && (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => {
                                                const novoSet = new Set(camposEditando);
                                                novoSet.add(chave);
                                                setCamposEditando(novoSet);
                                              }}
                                              disabled={!podeEditar}
                                            >
                                              Editar
                                            </Button>
                                          )}

                                          {/* Botões Salvar/Cancelar quando editando */}
                                          {estaEditando && (
                                            <>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="primary"
                                                onClick={() =>
                                                  handleSalvarEdicao(bancoSelecionado.id, conta.id, tipo.id)
                                                }
                                                disabled={registrando}
                                              >
                                                Salvar
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                  const novoSet = new Set(camposEditando);
                                                  novoSet.delete(chave);
                                                  setCamposEditando(novoSet);
                                                }}
                                                disabled={registrando}
                                              >
                                                Cancelar
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700" colSpan={2}>Total informado</th>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                    {formatCurrency(totalContaArredondado)}
                                  </td>
                                  <td className="px-3 py-2"></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Botão excluir selecionados - único para todos os cards */}
            {itensMarcadosExclusao.size > 0 && (
              <div className="flex justify-start">
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleAbrirModalExclusao}
                  disabled={!podeEditar || registrando}
                >
                  Excluir {itensMarcadosExclusao.size} selecionado(s)
                </Button>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                loading={registrando}
                disabled={!podeEditar || !bancoSelecionado || tiposOrdenados.length === 0}
              >
                Salvar novos lançamentos
              </Button>
            </div>
          </form>
        </Card>

        {/* Modal de confirmação de exclusão */}
        {mostrarModalExclusao && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="rounded-lg bg-white p-6 shadow-xl max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Confirmar exclusão
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Tem certeza que deseja excluir {itensMarcadosExclusao.size} lançamento(s)?
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setMostrarModalExclusao(false)}
                  disabled={registrando}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleConfirmarExclusao}
                  loading={registrando}
                >
                  Excluir
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
