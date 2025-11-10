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
  { titulo: string; subtitulo: string; topicos: string[] }
> = {
  '200': {
    titulo: 'Títulos — registrar como conta de receita 200',
    subtitulo:
      'Utilize esta seção para distribuir os valores recebidos por boletos e títulos entre os tipos de receita configurados.',
    topicos: [
      'Confirme se o banco selecionado corresponde ao extrato utilizado para registrar a cobrança.',
      'Some os valores de boletos liquidados no dia e informe o total no tipo de receita adequado.',
      'Revise o total informado antes de salvar para evitar diferenças com a previsão.',
    ],
  },
  '201': {
    titulo: 'Depósitos e PIX — registrar como conta de receita 201',
    subtitulo:
      'Informe depósitos, PIX e recebimentos com cartões vinculados ao banco selecionado na conta de receita 201.',
    topicos: [
      'Verifique se o banco escolhido é o responsável pelo crédito da movimentação.',
      'Distribua os valores por tipo de receita conforme a origem do recebimento (PIX, cartão, depósito).',
      'Garanta que os valores informados correspondam ao extrato bancário do dia.',
    ],
  },
};

const obterDescricaoConta = (conta: ContaOption) => {
  const codigoNormalizado = normalizarCodigoConta(conta.codigo);
  const info = INFORMACOES_CONTA[codigoNormalizado];
  if (info) {
    return info;
  }
  return {
    titulo: `Conta de receita ${conta.codigo}`,
    subtitulo: `Registre os valores lançados para a conta ${conta.nome}.`,
    topicos: [
      'Selecione o banco onde o lançamento foi realizado.',
      'Informe o valor total correspondente ao tipo de receita.',
      'Confira os totais calculados antes de concluir o registro.',
    ],
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

  const handleValorBancoChange = (
    bancoId: number,
    contaId: number,
    tipoId: number,
    valor: string,
  ) => {
    setValoresPorBanco((prev) => {
      const proximo: ValoresTextoPorBanco = { ...prev };
      const mapaBanco = { ...(proximo[bancoId] ?? {}) };
      const mapaConta = { ...(mapaBanco[contaId] ?? {}) };
      mapaConta[tipoId] = valor;
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

    if (!bancoSelecionadoId) {
      setMensagem({
        tipo: 'erro',
        texto: 'Selecione um banco para registrar os valores.',
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

    const valoresBanco = valoresPorBanco[bancoSelecionadoId] ?? {};
    const usuarioId = usuario.usr_id;
    if (!usuarioId || usuarioId.trim().length === 0) {
      setMensagem({
        tipo: 'erro',
        texto: 'Não foi possível identificar o usuário responsável pelo lançamento.',
      });
      return;
    }
    const registrosParaUpsert: Array<{
      cob_id?: number;
      cob_ban_id: number;
      cob_ctr_id: number;
      cob_tpr_id: number;
      cob_usr_id: string;
      cob_data: string;
      cob_valor: number;
    }> = [];
    const idsParaExcluir: number[] = [];

    contasRelevantes.forEach((conta) => {
      const valoresConta = valoresBanco[conta.id] ?? {};

        tiposOrdenados.forEach((tipo) => {
          const valorEntrada = valoresConta[tipo.id] ?? '';
          const valorCalculado = avaliarValor(valorEntrada);
          const chave = gerarChaveLancamento(bancoSelecionadoId!, conta.id, tipo.id);
        const registroExistente = lancamentosExistentes[chave];

        if (valorCalculado !== null && valorCalculado > 0) {
          if (!registroExistente || Math.abs(valorCalculado - registroExistente.valor) > 0.009) {
            // Se registro existe mas é de outro usuário, marca para deletar
            if (registroExistente && registroExistente.usrId !== usuarioId) {
              idsParaExcluir.push(registroExistente.id);
              // Cria novo registro sem cob_id (será insert)
              registrosParaUpsert.push({
                cob_ban_id: bancoSelecionadoId!,
                cob_ctr_id: conta.id,
                cob_tpr_id: tipo.id,
                cob_usr_id: usuarioId,
                cob_data: dataReferencia,
                cob_valor: valorCalculado,
              });
            } else {
              // Registro do mesmo usuário ou novo - faz upsert normal
              registrosParaUpsert.push({
                cob_id: registroExistente?.id,
                cob_ban_id: bancoSelecionadoId!,
                cob_ctr_id: conta.id,
                cob_tpr_id: tipo.id,
                cob_usr_id: usuarioId,
                cob_data: dataReferencia,
                cob_valor: valorCalculado,
              });
            }
          }
        } else if (registroExistente && registroExistente.bancoId === bancoSelecionadoId) {
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

      // IMPORTANTE: Executa exclusões ANTES dos upserts
      // para evitar conflitos ao substituir registros de outros usuários
      if (idsParaExcluir.length > 0) {
        const { error } = await supabase
          .from('cob_cobrancas')
          .delete()
          .in('cob_id', idsParaExcluir);
        if (error) throw error;
      }

      if (registrosParaUpsert.length > 0) {
        const payload = registrosParaUpsert.map((registro) => {
          const { cob_id, ...restante } = registro;
          return cob_id ? { cob_id, ...restante } : restante;
        });
        const { error } = await supabase.from('cob_cobrancas').upsert(payload, { onConflict: 'cob_id' });
        if (error) throw error;
      }

      setMensagem({
        tipo: 'sucesso',
        texto: 'Lançamentos de cobrança atualizados com sucesso.',
      });

      // Limpa os campos do formulário após salvar
      setValoresPorBanco({});

      await carregarLancamentosDia(usuario, dataReferencia);
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
                  <div className="border-b border-gray-200 px-4 py-3">
                    <h3 className="text-base font-semibold text-gray-900">Resumo por banco</h3>
                    <p className="mt-1 text-xs text-gray-500">
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
                  <div className="border-b border-gray-200 px-4 py-3">
                    <h3 className="text-base font-semibold text-gray-900">Resumo por tipo de receita</h3>
                    <p className="mt-1 text-xs text-gray-500">
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
              <div className="space-y-6">
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
                            <div className="space-y-2">
                              <div>
                                <h3 className="text-base font-semibold text-gray-900">{descricaoConta.titulo}</h3>
                                <p className="mt-1 text-xs text-gray-500">{descricaoConta.subtitulo}</p>
                              </div>
                              <ul className="list-disc space-y-1 pl-5 text-xs text-gray-500">
                                {descricaoConta.topicos.map((topico, index) => (
                                  <li key={`topico-${conta.id}-${index}`}>{topico}</li>
                                ))}
                              </ul>
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
                                  <th className="px-3 py-2 text-center font-semibold text-gray-600">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {tiposOrdenados.map((tipo) => {
                                  const valorCampo = valoresContaSelecionada[tipo.id] ?? '';
                                  const valorSalvo = valoresSalvosBancoSelecionado[conta.id]?.[tipo.id] ?? 0;
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
                                          fullWidth
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                        {valorSalvo > 0 ? formatCurrency(valorSalvo) : '-'}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          onClick={() =>
                                            handleExcluirMovimento(bancoSelecionado.id, conta.id, tipo.id)
                                          }
                                          disabled={(valorCampo === '' && valorSalvo <= 0) || !podeEditar}
                                        >
                                          Excluir movimento
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Total informado</th>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                    {formatCurrency(totalContaArredondado)}
                                  </td>
                                  <td colSpan={2}></td>
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

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                loading={registrando}
                disabled={!podeEditar || !bancoSelecionado || tiposOrdenados.length === 0}
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
