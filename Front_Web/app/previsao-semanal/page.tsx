'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Header } from '@/components/layout';
import { Button, Card, Loading } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import { loadSheetJS } from '@/lib/sheetjsLoader';
import {
  getOrCreateUser,
  getSupabaseClient,
  type UsuarioRow,
} from '@/lib/supabaseClient';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';
import { getUserSession } from '@/lib/userSession';

const RECEITA_CODIGOS: Record<string, string> = {
  'deposito e pix': '201',
  'antecipado': '201',
  'boleto': '200',
  'cartao debito': '202',
  'cartao débito': '202',
  'cartão debito': '202',
  'cartão débito': '202',
  'a vista': '202',
  'à vista': '202',
};

const RECEITA_PADROES: { padrao: RegExp; codigo: string }[] = [
  { padrao: /(deposito|depósito)/, codigo: '201' },
  { padrao: /pix/, codigo: '201' },
  { padrao: /antecipad/, codigo: '201' },
  { padrao: /boleto/, codigo: '200' },
  { padrao: /cartao|cartão|debito|débito/, codigo: '202' },
  { padrao: /\bvista\b/, codigo: '202' },
];

const TITULO_CORRECOES: Record<string, string> = {
  'com materail e consumo': 'material e consumo',
  'com material e consumo': 'material e consumo',
};

const TIPO_RECEITA_PREFERENCIAS: Record<string, string> = {
  'deposito e pix': 'receita prevista',
  'deposito e pix vero varejo': 'receita prevista',
  'antecipado': 'receita prevista',
  'antecipado vero varejo': 'receita prevista',
  'boleto': 'receita prevista',
  'cartao debito vero varejo': 'outros',
  'cartao debito vero': 'outros',
  'cartao debito': 'outros',
  'a vista': 'outros',
  'vista': 'outros',
};

const TIPO_RECEITA_PADROES: { padrao: RegExp; nome: string }[] = [
  { padrao: /(deposito|depósito).*pix/, nome: 'receita prevista' },
  { padrao: /antecipad/, nome: 'receita prevista' },
  { padrao: /boleto/, nome: 'receita prevista' },
  { padrao: /cartao|cartão|debito|débito.*vero.*varejo/, nome: 'outros' },
  { padrao: /\ba vista\b|\bà vista\b|avista/, nome: 'outros' },
];

type AreaOption = { id: number; nome: string; normalizado: string };
type ContaOption = {
  id: number;
  nome: string;
  codigo: string;
  bancoId: number | null;
  bancoNome: string | null;
  normalizado: string;
};
type TipoReceitaOption = { id: number; nome: string; normalizado: string };
type BancoOption = { id: number; nome: string };

type DiaValor = { data: string; valor: number; texto: string };

type CabecalhoData = { coluna: number; data: string };

type LinhaImportada = {
  id: string;
  tipo: 'gasto' | 'receita' | 'saldo_inicial';
  titulo: string;
  valores: DiaValor[];
  selecionado: boolean;
  areaId: number | null;
  contaId: number | null;
  tipoReceitaId: number | null;
  bancoId: number | null;
  erros: string[];
};

type PrevisaoItemRegistrado = {
  id: number;
  data: string;
  tipo: string;
  categoria: string;
  valor: number;
  areaId: number | null;
  contaId: number | null;
  bancoId: number | null;
};

type SemanaResumo = {
  id: number;
  status: string;
  itens: PrevisaoItemRegistrado[];
};

type Mensagem = { tipo: 'sucesso' | 'erro' | 'info'; texto: string };

const gerarUUID = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const normalizarTexto = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const ajustarTituloNormalizado = (tituloNormalizado: string): string =>
  TITULO_CORRECOES[tituloNormalizado] ?? tituloNormalizado;

const encontrarTipoPreferido = (
  tituloNormalizado: string,
  mapaTipos: Map<string, TipoReceitaOption>,
): TipoReceitaOption | null => {
  const preferenciaDireta = TIPO_RECEITA_PREFERENCIAS[tituloNormalizado];
  if (preferenciaDireta) {
    const tipoDireto = mapaTipos.get(normalizarTexto(preferenciaDireta));
    if (tipoDireto) {
      return tipoDireto;
    }
  }

  for (const item of TIPO_RECEITA_PADROES) {
    if (item.padrao.test(tituloNormalizado)) {
      const tipo = mapaTipos.get(normalizarTexto(item.nome));
      if (tipo) {
        return tipo;
      }
    }
  }

  return null;
};

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const getMonday = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const addWeeks = (date: Date, weeks: number): Date => addDays(date, weeks * 7);

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

const formatarIntervaloSemana = (inicioIso: string): string => {
  if (!inicioIso) return '';
  const inicio = new Date(`${inicioIso}T00:00:00`);
  const fim = addDays(inicio, 4);
  return `${formatarDataPt(toISODate(inicio))} a ${formatarDataPt(toISODate(fim))}`;
};

const identificarCodigoReceita = (tituloNormalizado: string): string | null => {
  const codigoDireto = RECEITA_CODIGOS[tituloNormalizado];
  if (codigoDireto) {
    return codigoDireto;
  }

  for (const item of RECEITA_PADROES) {
    if (item.padrao.test(tituloNormalizado)) {
      return item.codigo;
    }
  }

  return null;
};

const parseNumero = (valor: unknown): number => {
  if (typeof valor === 'number') {
    return Math.round(valor * 100) / 100;
  }
  if (typeof valor === 'string') {
    const textoNormalizado = valor
      .replace(/\s+/g, '')
      .replace(/[−–—]/g, '-')
      .replace(/[^0-9.,-]/g, '');

    if (!textoNormalizado) {
      return 0;
    }

    const negativo = textoNormalizado.includes('-');
    const semSinal = textoNormalizado.replace(/-/g, '');

    const ultimoPonto = semSinal.lastIndexOf('.');
    const ultimaVirgula = semSinal.lastIndexOf(',');

    const construirNumero = (separadorIndex: number, separador: ',' | '.') => {
      const parteInteira = semSinal.slice(0, separadorIndex);
      const parteDecimal = semSinal.slice(separadorIndex + 1);
      const inteiroLimpo =
        separador === ',' ? parteInteira.replace(/\./g, '') : parteInteira.replace(/,/g, '');
      const decimalLimpo =
        separador === ',' ? parteDecimal.replace(/\./g, '') : parteDecimal.replace(/,/g, '');
      return `${inteiroLimpo}.${decimalLimpo}`;
    };

    let numeroTexto = '';

    if (ultimaVirgula !== -1 || ultimoPonto !== -1) {
      let separador: ',' | '.' | null = null;

      if (ultimaVirgula !== -1 && ultimoPonto !== -1) {
        separador = ultimaVirgula > ultimoPonto ? ',' : '.';
      } else if (ultimaVirgula !== -1) {
        const decimais = semSinal.length - ultimaVirgula - 1;
        separador = decimais > 0 && decimais <= 2 ? ',' : null;
      } else if (ultimoPonto !== -1) {
        const decimais = semSinal.length - ultimoPonto - 1;
        separador = decimais > 0 && decimais <= 2 ? '.' : null;
      }

      if (separador) {
        const indice = separador === ',' ? ultimaVirgula : ultimoPonto;
        numeroTexto = construirNumero(indice, separador);
      } else {
        numeroTexto = semSinal.replace(/[.,]/g, '');
      }
    } else {
      numeroTexto = semSinal;
    }

    if (!numeroTexto) {
      return 0;
    }

    const numero = Number(numeroTexto);
    if (!Number.isFinite(numero)) {
      return 0;
    }

    const resultado = negativo ? -numero : numero;
    return Math.round(resultado * 100) / 100;
  }
  return 0;
};

const validarLinha = (linha: LinhaImportada): string[] => {
  const erros: string[] = [];
  if (!linha.selecionado) {
    return erros;
  }

  if (linha.tipo === 'gasto' && !linha.areaId) {
    erros.push('Selecione uma área para este gasto.');
  }

  if (linha.tipo === 'receita') {
    if (!linha.contaId) {
      erros.push('Selecione uma conta de receita.');
    }
    if (!linha.tipoReceitaId) {
      erros.push('Informe o tipo de receita correspondente.');
    }
  }

  return erros;
};

const currentMondayIso = toISODate(getMonday(new Date()));
const defaultSemanaIso = toISODate(addWeeks(getMonday(new Date()), 1));

const formatarNumeroParaTexto = (valor: number): string =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const criarDiaValor = (data: string, valor: number): DiaValor => ({
  data,
  valor,
  texto: formatarNumeroParaTexto(valor),
});

const gerarSemanasDisponiveis = (): { value: string; label: string }[] => {
  const base = getMonday(new Date());
  return Array.from({ length: 8 }, (_, index) => {
    const data = addWeeks(base, index);
    const iso = toISODate(data);
    return { value: iso, label: formatarIntervaloSemana(iso) };
  });
};

const semanasDisponiveis = gerarSemanasDisponiveis();

const obterDatasDaSemana = (inicioIso: string): string[] => {
  const inicio = new Date(`${inicioIso}T00:00:00`);
  return Array.from({ length: 5 }, (_, index) => toISODate(addDays(inicio, index)));
};

const encontrarContaPorId = (contas: ContaOption[], id: number | null) =>
  contas.find((conta) => conta.id === id) ?? null;

const encontrarAreaPorId = (areas: AreaOption[], id: number | null) =>
  areas.find((area) => area.id === id) ?? null;

const encontrarTipoPorId = (tipos: TipoReceitaOption[], id: number | null) =>
  tipos.find((tipo) => tipo.id === id) ?? null;
const LancamentoPrevisaoSemanalPage: React.FC = () => {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [erroInicial, setErroInicial] = useState<string | null>(null);

  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [contas, setContas] = useState<ContaOption[]>([]);
  const [tiposReceita, setTiposReceita] = useState<TipoReceitaOption[]>([]);
  const [bancos, setBancos] = useState<BancoOption[]>([]);

  const [semanaSelecionada, setSemanaSelecionada] = useState<string>(defaultSemanaIso);
  const [linhas, setLinhas] = useState<LinhaImportada[]>([]);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [processandoArquivo, setProcessandoArquivo] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [importando, setImportando] = useState(false);

  const [previsaoExistente, setPrevisaoExistente] = useState<SemanaResumo | null>(null);
  const [carregandoPrevisao, setCarregandoPrevisao] = useState(false);
  const arquivoInputRef = useRef<HTMLInputElement | null>(null);

  const datasTabela = useMemo(() => {
    if (linhas.length > 0) {
      return linhas[0].valores.map((valor) => valor.data);
    }
    return obterDatasDaSemana(semanaSelecionada);
  }, [linhas, semanaSelecionada]);

  const edicaoPermitida = useMemo(() => {
    const selecionadaData = new Date(`${semanaSelecionada}T00:00:00`);
    const atual = new Date(`${currentMondayIso}T00:00:00`);
    return selecionadaData.getTime() > atual.getTime();
  }, [semanaSelecionada]);

  const totaisReceita = useMemo(
    () =>
      datasTabela.map((data) =>
        linhas
          .filter((linha) => linha.tipo === 'receita' && linha.selecionado)
          .reduce((acc, linha) => {
            const encontrado = linha.valores.find((item) => item.data === data);
            return acc + (encontrado?.valor ?? 0);
          }, 0),
      ),
    [datasTabela, linhas],
  );

  const totaisGasto = useMemo(
    () =>
      datasTabela.map((data) =>
        linhas
          .filter((linha) => linha.tipo === 'gasto' && linha.selecionado)
          .reduce((acc, linha) => {
            const encontrado = linha.valores.find((item) => item.data === data);
            return acc + (encontrado?.valor ?? 0);
          }, 0),
      ),
    [datasTabela, linhas],
  );

  const saldoInicialValor = useMemo(() => {
    const linhaSaldo = linhas.find((linha) => linha.tipo === 'saldo_inicial');
    return linhaSaldo?.valores[0]?.valor ?? 0;
  }, [linhas]);

  const saldoDiarioPrevisto = useMemo(
    () => totaisReceita.map((receita, index) => receita - (totaisGasto[index] ?? 0)),
    [totaisReceita, totaisGasto],
  );

  const saldoAcumuladoPrevisto = useMemo(() => {
    const acumulado: number[] = [];
    saldoDiarioPrevisto.forEach((valor, index) => {
      if (index === 0) {
        acumulado.push(saldoInicialValor + valor);
      } else {
        acumulado.push(acumulado[index - 1] + valor);
      }
    });
    return acumulado;
  }, [saldoDiarioPrevisto, saldoInicialValor]);
  const carregarOpcoes = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const [areasRes, contasRes, tiposRes, bancosRes] = await Promise.all([
        supabase
          .from('are_areas')
          .select('are_id, are_nome')
          .eq('are_ativo', true)
          .order('are_nome', { ascending: true }),
        supabase
          .from('ctr_contas_receita')
          .select('ctr_id, ctr_nome, ctr_codigo, ctr_ban_id, ban_bancos(ban_nome)')
          .eq('ctr_ativo', true)
          .order('ctr_nome', { ascending: true }),
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
      ]);

      if (areasRes.error) throw areasRes.error;
      if (contasRes.error) throw contasRes.error;
      if (tiposRes.error) throw tiposRes.error;
      if (bancosRes.error) throw bancosRes.error;

      setAreas(
        (areasRes.data ?? []).map((area) => ({
          id: Number(area.are_id),
          nome: area.are_nome ?? 'Área sem nome',
          normalizado: normalizarTexto(area.are_nome ?? ''),
        })),
      );

      setContas(
        (contasRes.data ?? []).map((conta) => {
          const bancoRelacionado = Array.isArray(conta.ban_bancos)
            ? conta.ban_bancos[0]
            : (conta.ban_bancos as { ban_nome?: string | null } | null);
          const bancoNome = bancoRelacionado?.ban_nome ?? 'Sem banco vinculado';
          return {
            id: Number(conta.ctr_id),
            nome: conta.ctr_nome ?? 'Conta sem nome',
            codigo: (conta.ctr_codigo ?? '').trim(),
            bancoId: conta.ctr_ban_id !== null ? Number(conta.ctr_ban_id) : null,
            bancoNome,
            normalizado: normalizarTexto(conta.ctr_nome ?? ''),
          } satisfies ContaOption;
        }),
      );

      setTiposReceita(
        (tiposRes.data ?? []).map((tipo) => ({
          id: Number(tipo.tpr_id),
          nome: tipo.tpr_nome ?? 'Tipo sem nome',
          normalizado: normalizarTexto(tipo.tpr_nome ?? ''),
        })),
      );

      setBancos(
        (bancosRes.data ?? []).map((banco) => ({
          id: Number(banco.ban_id),
          nome: banco.ban_nome ?? 'Banco sem nome',
        })),
      );
    } catch (error) {
      console.error('Erro ao carregar opções da previsão semanal:', error);
      setMensagem({
        tipo: 'erro',
        texto: 'Não foi possível carregar cadastros auxiliares para a previsão semanal.',
      });
    }
  }, []);

  const carregarUsuario = useCallback(async () => {
    try {
      setCarregandoInicial(true);
      const supabase = getSupabaseClient();
      const { userId, userName, userEmail } = getUserSession();
      const { data, error } = await getOrCreateUser(
        supabase,
        userId,
        userName ?? undefined,
        userEmail ?? undefined,
      );

      if (error) throw error;
      if (!data) {
        setErroInicial('Não foi possível identificar o usuário atual.');
        return;
      }

      setUsuario(data);
      setErroInicial(null);
      await carregarOpcoes();
    } catch (error) {
      console.error('Erro ao carregar usuário ou cadastros:', error);
      setErroInicial('Falha ao carregar dados iniciais para a previsão semanal.');
    } finally {
      setCarregandoInicial(false);
    }
  }, [carregarOpcoes]);

  const carregarPrevisaoExistente = useCallback(
    async (semanaInicio: string, usuarioId: string) => {
      try {
        setCarregandoPrevisao(true);
        const supabase = getSupabaseClient();
        const { data: semana, error: semanaErro } = await supabase
          .from('pvs_semanas')
          .select('pvs_id, pvs_status')
          .eq('pvs_usr_id', usuarioId)
          .eq('pvs_semana_inicio', semanaInicio)
          .maybeSingle();

        if (semanaErro) throw semanaErro;
        if (!semana) {
          setPrevisaoExistente(null);
          return;
        }

        const { data: itens, error: itensErro } = await supabase
          .from('pvi_previsao_itens')
          .select('pvi_id, pvi_data, pvi_tipo, pvi_categoria, pvi_valor, pvi_are_id, pvi_ctr_id, pvi_ban_id')
          .eq('pvi_pvs_id', semana.pvs_id)
          .order('pvi_data', { ascending: true })
          .order('pvi_ordem', { ascending: true });

        if (itensErro) throw itensErro;

        setPrevisaoExistente({
          id: Number(semana.pvs_id),
          status: semana.pvs_status ?? 'rascunho',
          itens: (itens ?? []).map((item) => ({
            id: Number(item.pvi_id),
            data: String(item.pvi_data ?? ''),
            tipo: String(item.pvi_tipo ?? ''),
            categoria: String(item.pvi_categoria ?? ''),
            valor: parseNumero(item.pvi_valor),
            areaId: item.pvi_are_id !== null ? Number(item.pvi_are_id) : null,
            contaId: item.pvi_ctr_id !== null ? Number(item.pvi_ctr_id) : null,
            bancoId: item.pvi_ban_id !== null ? Number(item.pvi_ban_id) : null,
          })),
        });
      } catch (error) {
        console.error('Erro ao carregar previsão existente:', error);
        setPrevisaoExistente(null);
      } finally {
        setCarregandoPrevisao(false);
      }
    },
    [],
  );

  useEffect(() => {
    carregarUsuario();
  }, [carregarUsuario]);

  useEffect(() => {
    if (usuario) {
      carregarPrevisaoExistente(semanaSelecionada, usuario.usr_id);
    }
  }, [carregarPrevisaoExistente, semanaSelecionada, usuario]);

  const atualizarLinha = useCallback(
    (id: string, atualizador: (linha: LinhaImportada) => LinhaImportada) => {
      setLinhas((prev) => prev.map((linha) => (linha.id === id ? atualizador(linha) : linha)));
    },
  []);
  const parsePlanilha = useCallback(
    async (file: File) => {
      if (!areas.length && !contas.length) {
        setMensagem({
          tipo: 'erro',
          texto: 'Cadastre áreas e contas de receita antes de importar a previsão.',
        });
        return;
      }

      setMensagem(null);
      setLinhas([]);
      setProcessandoArquivo(true);
      try {
        const XLSX = await loadSheetJS();
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
          blankrows: false,
        });

        if (!rows || rows.length === 0) {
          throw new Error('A planilha está vazia.');
        }

        const semanaSelecionadaData = new Date(`${semanaSelecionada}T00:00:00`);
        const anoReferenciaSemana = semanaSelecionadaData.getFullYear();
        const mesReferenciaSemana = semanaSelecionadaData.getMonth() + 1;

        const ajustarAnoPorMes = (mes: number, anoPadrao: number): number => {
          if (!Number.isFinite(mes) || mes < 1 || mes > 12) {
            return anoPadrao;
          }

          if (mes < mesReferenciaSemana && mesReferenciaSemana - mes > 6) {
            return anoPadrao + 1;
          }

          if (mes > mesReferenciaSemana && mes - mesReferenciaSemana > 6) {
            return anoPadrao - 1;
          }

          return anoPadrao;
        };

        const parseData = (valor: any): string | null => {
          if (!valor) {
            return null;
          }
          if (valor instanceof Date) {
            return toISODate(valor);
          }
          if (typeof valor === 'number') {
            const parsed = XLSX.SSF.parse_date_code(valor);
            if (!parsed) return null;
            const data = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
            return toISODate(data);
          }
          if (typeof valor === 'string') {
            const texto = valor.replace(/\s+/g, ' ').trim();
            if (!texto) return null;
            const completo = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
            if (completo) {
              const dia = Number(completo[1]);
              const mes = Number(completo[2]);
              let ano = Number(completo[3]);
              if (ano < 100) {
                ano += ano < 50 ? 2000 : 1900;
              }
              if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
                return null;
              }
              const data = new Date(Date.UTC(ano, mes - 1, dia));
              return toISODate(data);
            }

            const semAno = texto.match(/^(\d{1,2})[\/-](\d{1,2})$/);
            if (semAno) {
              const dia = Number(semAno[1]);
              const mes = Number(semAno[2]);
              if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
                return null;
              }
              const anoAjustado = ajustarAnoPorMes(mes, anoReferenciaSemana);
              const data = new Date(Date.UTC(anoAjustado, mes - 1, dia));
              return toISODate(data);
            }

            const parsed = new Date(texto);
            if (Number.isNaN(parsed.valueOf())) {
              return null;
            }
            return toISODate(parsed);
          }
          return null;
        };

        let headerIndex = -1;
        let datasDetectadas: CabecalhoData[] = [];

        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          if (!row || row.length < 2) continue;
          const datas = row
            .slice(1)
            .map((cell: unknown, idx: number) => {
              const data = parseData(cell);
              return data ? { coluna: idx + 1, data } : null;
            })
            .filter((item): item is CabecalhoData => item !== null);
          if (datas.length >= 2) {
            headerIndex = index;
            datasDetectadas = datas;
            break;
          }
        }

        if (headerIndex === -1) {
          throw new Error('Não foi possível identificar a linha de datas na planilha.');
        }

        if (datasDetectadas.length === 0) {
          throw new Error('Nenhuma data válida foi encontrada na planilha.');
        }

        const datasSemanaSelecionada = obterDatasDaSemana(semanaSelecionada);
        const dataInicio = datasSemanaSelecionada[0];
        const dataFim = datasSemanaSelecionada[datasSemanaSelecionada.length - 1];

        // Filtra apenas as datas detectadas que estão dentro do período da semana
        const colunasDentroDoPeriodo = datasDetectadas.filter((cabecalho) => {
          const dataDetectada = cabecalho.data;
          return dataDetectada >= dataInicio && dataDetectada <= dataFim;
        });

        if (colunasDentroDoPeriodo.length === 0) {
          throw new Error(
            `Nenhuma data da planilha está dentro do período selecionado (${formatarDataPt(dataInicio)} a ${formatarDataPt(dataFim)}). Verifique o arquivo e tente novamente.`,
          );
        }

        // Ordena as colunas por data
        colunasDentroDoPeriodo.sort((a, b) => a.data.localeCompare(b.data));

        // Usa as datas detectadas que estão dentro do período
        datasDetectadas = colunasDentroDoPeriodo;

        const mapaAreas = new Map(areas.map((area) => [area.normalizado, area]));
        const mapaContasCodigo = new Map(contas.map((conta) => [conta.codigo, conta]));
        const mapaContasNome = new Map(contas.map((conta) => [conta.normalizado, conta]));
        const mapaTipos = new Map(tiposReceita.map((tipo) => [tipo.normalizado, tipo]));

        mapaContasNome.forEach((conta, chave) => {
          const correcao = TITULO_CORRECOES[chave];
          if (correcao && !mapaContasNome.has(correcao)) {
            mapaContasNome.set(correcao, conta);
          }
        });

        Object.entries(TITULO_CORRECOES).forEach(([alias, destino]) => {
          const contaCorrigida = mapaContasNome.get(destino);
          if (contaCorrigida) {
            mapaContasNome.set(alias, contaCorrigida);
          }
        });

        const novasLinhas: LinhaImportada[] = [];
        let saldoInicialLinha: LinhaImportada | null = null;

        for (let index = headerIndex + 1; index < rows.length; index += 1) {
          const row = rows[index];
          if (!row) continue;

          const tituloBruto = row[0];
          if (!tituloBruto) continue;

          const tituloOriginal = String(tituloBruto).trim();
          if (!tituloOriginal) continue;

          const tituloNormalizadoOriginal = normalizarTexto(tituloOriginal);
          const tituloNormalizado = ajustarTituloNormalizado(tituloNormalizadoOriginal);

          if (tituloNormalizado === 'receitas') continue;
          if (tituloNormalizadoOriginal.startsWith('total despesa')) continue;
          if (
            tituloNormalizadoOriginal.startsWith('saldo diario') ||
            tituloNormalizadoOriginal.startsWith('saldo diário')
          ) {
            continue;
          }
          if (tituloNormalizadoOriginal.startsWith('saldo acumulado')) {
            continue;
          }

          const valores = datasDetectadas.map((cabecalho) =>
            criarDiaValor(cabecalho.data, parseNumero(row[cabecalho.coluna])),
          );

          if (tituloNormalizado.startsWith('saldo inicial')) {
            saldoInicialLinha = {
              id: gerarUUID(),
              tipo: 'saldo_inicial',
              titulo: 'Saldo inicial',
              valores: valores.map((item, idx) =>
                idx === 0 ? item : criarDiaValor(item.data, 0),
              ),
              selecionado: true,
              areaId: null,
              contaId: null,
              tipoReceitaId: null,
              bancoId: null,
              erros: [],
            };
            continue;
          }

          if (tituloNormalizadoOriginal.startsWith('gasto')) {
            const nomeArea = tituloOriginal.replace(/^gastos?\s*[:\-]?/i, '').trim();
            const area = mapaAreas.get(normalizarTexto(nomeArea));
            const linha: LinhaImportada = {
              id: gerarUUID(),
              tipo: 'gasto',
              titulo: nomeArea || tituloOriginal,
              valores,
              selecionado: Boolean(area),
              areaId: area?.id ?? null,
              contaId: null,
              tipoReceitaId: null,
              bancoId: null,
              erros: area ? [] : ['Área não encontrada para este gasto.'],
            };
            novasLinhas.push(linha);
            continue;
          }

          const contaCodigo = identificarCodigoReceita(tituloNormalizado);
          let conta = contaCodigo ? mapaContasCodigo.get(contaCodigo) : undefined;
          if (!conta) {
            conta = mapaContasNome.get(tituloNormalizado);
          }

          const tipoReceitaPreferido = encontrarTipoPreferido(tituloNormalizado, mapaTipos);
          const tipoReceitaSugerido = Array.from(mapaTipos.values()).find((tipo) =>
            tipo.normalizado.includes(tituloNormalizado),
          );

          const linhaReceita: LinhaImportada = {
            id: gerarUUID(),
            tipo: 'receita',
            titulo: tituloOriginal,
            valores,
            selecionado: Boolean(conta),
            areaId: null,
            contaId: conta?.id ?? null,
            tipoReceitaId: tipoReceitaPreferido?.id ?? tipoReceitaSugerido?.id ?? null,
            bancoId: conta?.bancoId ?? null,
            erros: [],
          };

          linhaReceita.erros = validarLinha(linhaReceita);
          if (linhaReceita.erros.length > 0) {
            linhaReceita.selecionado = false;
          }

          novasLinhas.push(linhaReceita);
        }

        const resultado = saldoInicialLinha ? [saldoInicialLinha, ...novasLinhas] : novasLinhas;
        setLinhas(resultado);
        setMensagem({
          tipo: 'info',
          texto: 'Planilha carregada com sucesso. Revise os dados antes de importar.',
        });
      } catch (error) {
        console.error('Erro ao processar planilha da previsão semanal:', error);
        setLinhas([]);
        setArquivoNome(null);
        setMensagem({
          tipo: 'erro',
          texto:
            error instanceof Error
              ? error.message
              : 'Não foi possível interpretar o arquivo informado.',
        });
      } finally {
        setProcessandoArquivo(false);
      }
    },
    [areas, contas, tiposReceita, semanaSelecionada],
  );

  const handleArquivoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setArquivoNome(file.name);
    await parsePlanilha(file);
    if (arquivoInputRef.current) {
      arquivoInputRef.current.value = '';
    }
  };
  const handleCancelarArquivo = () => {
    if (processandoArquivo) {
      return;
    }
    setArquivoNome(null);
    setLinhas([]);
    setMensagem(null);
    if (arquivoInputRef.current) {
      arquivoInputRef.current.value = '';
    }
  };
  const handleToggleLinha = (id: string, selecionado: boolean) => {
    atualizarLinha(id, (linha) => {
      const proximo = {
        ...linha,
        selecionado,
      };
      return {
        ...proximo,
        erros: validarLinha(proximo),
      };
    });
  };

  const handleValorChange = (linhaId: string, data: string, texto: string) => {
    atualizarLinha(linhaId, (linha) => {
      const valoresAtualizados = linha.valores.map((item) => {
        if (item.data !== data) {
          return item;
        }

        const numero = parseNumero(texto);
        return {
          ...item,
          valor: numero,
          texto,
        };
      });
      return {
        ...linha,
        valores: valoresAtualizados,
      };
    });
  };

  const handleValorBlur = (linhaId: string, data: string) => {
    atualizarLinha(linhaId, (linha) => {
      const valoresAtualizados = linha.valores.map((item) => {
        if (item.data !== data) {
          return item;
        }

        if (item.texto.trim() === '') {
          return { ...item, valor: 0, texto: '' };
        }

        return {
          ...item,
          texto: formatarNumeroParaTexto(item.valor),
        };
      });
      return {
        ...linha,
        valores: valoresAtualizados,
      };
    });
  };

  const handleAreaChange = (linhaId: string, areaId: number | null) => {
    atualizarLinha(linhaId, (linha) => {
      const proximo = {
        ...linha,
        areaId,
        selecionado: areaId !== null ? true : linha.selecionado,
      };
      return {
        ...proximo,
        erros: validarLinha(proximo),
      };
    });
  };

  const handleContaChange = (linhaId: string, contaId: number | null) => {
    atualizarLinha(linhaId, (linha) => {
      const conta = contaId !== null ? encontrarContaPorId(contas, contaId) : null;
      const tituloNormalizado = ajustarTituloNormalizado(normalizarTexto(linha.titulo));
      const mapaTipos = new Map(tiposReceita.map((tipo) => [tipo.normalizado, tipo]));
      const tipoPreferido = encontrarTipoPreferido(tituloNormalizado, mapaTipos);
      const tipoReceitaSugestao = conta
        ? tiposReceita.find((tipo) => tipo.normalizado.includes(normalizarTexto(linha.titulo)))
        : null;
      const proximo = {
        ...linha,
        contaId,
        bancoId: conta?.bancoId ?? null,
        tipoReceitaId: linha.tipoReceitaId ?? tipoPreferido?.id ?? tipoReceitaSugestao?.id ?? null,
        selecionado: contaId !== null ? true : linha.selecionado,
      };
      return {
        ...proximo,
        erros: validarLinha(proximo),
      };
    });
  };

  const handleTipoReceitaChange = (linhaId: string, tipoId: number | null) => {
    atualizarLinha(linhaId, (linha) => {
      const proximo = {
        ...linha,
        tipoReceitaId: tipoId,
      };
      return {
        ...proximo,
        erros: validarLinha(proximo),
      };
    });
  };
  const handleImportar = async () => {
    if (!usuario) {
      setMensagem({ tipo: 'erro', texto: 'Usuário não identificado para importar a previsão.' });
      return;
    }

    const linhasSelecionadas = linhas.filter((linha) => linha.selecionado);
    if (linhasSelecionadas.length === 0) {
      setMensagem({ tipo: 'erro', texto: 'Selecione pelo menos uma linha para importação.' });
      return;
    }

    const linhasInvalidas = linhasSelecionadas.filter((linha) => validarLinha(linha).length > 0);
    if (linhasInvalidas.length > 0) {
      setMensagem({
        tipo: 'erro',
        texto: 'Existem linhas selecionadas sem associação obrigatória. Ajuste antes de prosseguir.',
      });
      return;
    }

    const itensParaInserir: {
      tipo: 'receita' | 'gasto' | 'saldo_inicial' | 'saldo_diario' | 'saldo_acumulado';
      data: string;
      categoria: string;
      valor: number;
      areaId: number | null;
      contaId: number | null;
      tipoReceitaId: number | null;
      bancoId: number | null;
      ordem: number;
    }[] = [];

    linhasSelecionadas.forEach((linha, linhaIndex) => {
      linha.valores.forEach((valor, valorIndex) => {
        const valorNumerico = Number.isFinite(valor.valor) ? Number(valor.valor) : 0;
        if (linha.tipo === 'saldo_inicial') {
          if (valorIndex === 0 && valorNumerico !== 0) {
            itensParaInserir.push({
              tipo: 'saldo_inicial',
              data: valor.data,
              categoria: linha.titulo,
              valor: Math.round(valorNumerico * 100) / 100,
              areaId: null,
              contaId: null,
              tipoReceitaId: null,
              bancoId: null,
              ordem: linhaIndex * 10,
            });
          }
          return;
        }

        if (valorNumerico === 0) {
          return;
        }

        itensParaInserir.push({
          tipo: linha.tipo,
          data: valor.data,
          categoria: linha.titulo,
          valor: Math.round(valorNumerico * 100) / 100,
          areaId: linha.areaId,
          contaId: linha.contaId,
          tipoReceitaId: linha.tipoReceitaId,
          bancoId: linha.bancoId,
          ordem: linhaIndex * 10 + valorIndex,
        });
      });
    });

    datasTabela.forEach((data, index) => {
      itensParaInserir.push({
        tipo: 'saldo_diario',
        data,
        categoria: 'Saldo diário calculado',
        valor: Math.round((saldoDiarioPrevisto[index] ?? 0) * 100) / 100,
        areaId: null,
        contaId: null,
        tipoReceitaId: null,
        bancoId: null,
        ordem: 900 + index,
      });
      itensParaInserir.push({
        tipo: 'saldo_acumulado',
        data,
        categoria: 'Saldo acumulado calculado',
        valor: Math.round((saldoAcumuladoPrevisto[index] ?? 0) * 100) / 100,
        areaId: null,
        contaId: null,
        tipoReceitaId: null,
        bancoId: null,
        ordem: 950 + index,
      });
    });

    if (itensParaInserir.length === 0) {
      setMensagem({ tipo: 'erro', texto: 'Nenhum valor válido foi encontrado para importação.' });
      return;
    }
    try {
      setImportando(true);
      setMensagem(null);
      const supabase = getSupabaseClient();
      const { data: semanaExistente, error: semanaErro } = await supabase
        .from('pvs_semanas')
        .select('pvs_id')
        .eq('pvs_usr_id', usuario.usr_id)
        .eq('pvs_semana_inicio', semanaSelecionada)
        .maybeSingle();

      if (semanaErro) throw semanaErro;

      let semanaId = semanaExistente?.pvs_id as number | undefined;
      const semanaFim = toISODate(addDays(new Date(`${semanaSelecionada}T00:00:00`), 4));

      if (!semanaId) {
        const { data: criada, error: criarErro } = await supabase
          .from('pvs_semanas')
          .insert({
            pvs_usr_id: usuario.usr_id,
            pvs_semana_inicio: semanaSelecionada,
            pvs_semana_fim: semanaFim,
            pvs_status: 'importado',
          })
          .select('pvs_id')
          .single();

        if (criarErro) throw criarErro;
        semanaId = criada?.pvs_id as number | undefined;
      } else {
        const { error: atualizarErro } = await supabase
          .from('pvs_semanas')
          .update({ pvs_semana_fim: semanaFim, pvs_status: 'importado' })
          .eq('pvs_id', semanaId);
        if (atualizarErro) throw atualizarErro;

        const { error: limparErro } = await supabase
          .from('pvi_previsao_itens')
          .delete()
          .eq('pvi_pvs_id', semanaId);
        if (limparErro) throw limparErro;
      }

      if (!semanaId) {
        throw new Error('Semana não pôde ser determinada para importação.');
      }

      const payload = itensParaInserir.map((item) => ({
        pvi_pvs_id: semanaId,
        pvi_usr_id: usuario.usr_id,
        pvi_data: item.data,
        pvi_tipo: item.tipo,
        pvi_categoria: item.categoria,
        pvi_valor: item.valor,
        pvi_are_id: item.areaId,
        pvi_ctr_id: item.contaId,
        pvi_tpr_id: item.tipoReceitaId,
        pvi_ban_id: item.bancoId,
        pvi_ordem: item.ordem,
        pvi_importado: true,
      }));

      const { error: inserirErro } = await supabase.from('pvi_previsao_itens').insert(payload);
      if (inserirErro) throw inserirErro;

      setMensagem({ tipo: 'sucesso', texto: 'Previsão semanal importada com sucesso.' });
      await carregarPrevisaoExistente(semanaSelecionada, usuario.usr_id);
    } catch (error) {
      console.error('Erro ao importar previsão semanal:', error);
      setMensagem({
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Falha ao importar a previsão semanal. Verifique os dados e tente novamente.',
        ),
      });
    } finally {
      setImportando(false);
    }
  };
  if (carregandoInicial) {
    return (
      <>
        <Header title="Previsão Semanal" />
        <div className="page-content flex h-96 items-center justify-center">
          <Loading text="Carregando informações iniciais..." />
        </div>
      </>
    );
  }

  if (erroInicial) {
    return (
      <>
        <Header title="Previsão Semanal" />
        <div className="page-content">
          <Card>
            <p className="text-sm text-error-700">{erroInicial}</p>
          </Card>
        </div>
      </>
    );
  }
  return (
    <>
      <Header
        title="Previsão Semanal"
        subtitle="Importe os dados previstos de recebimentos e gastos para a próxima semana"
      />

      <div className="page-content space-y-6">
        <Card>
          <div className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <label className="text-sm font-medium text-gray-700">
                Semana de referência
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={semanaSelecionada}
                  onChange={(event) => {
                    setSemanaSelecionada(event.target.value);
                  }}
                >
                  {semanasDisponiveis.map((semana) => (
                    <option key={semana.value} value={semana.value}>
                      {semana.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <label className="flex flex-col text-sm font-medium text-gray-700">
                  Arquivo Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    ref={arquivoInputRef}
                    onChange={handleArquivoChange}
                    disabled={processandoArquivo || !edicaoPermitida}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCancelarArquivo}
                  disabled={!arquivoNome || processandoArquivo}
                >
                  Cancelar seleção
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleImportar}
                  disabled={
                    !edicaoPermitida || importando || linhas.length === 0 || processandoArquivo
                  }
                  loading={importando}
                >
                  Importar previsão
                </Button>
              </div>
            </div>

            {!edicaoPermitida && (
              <div className="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
                A edição está bloqueada para a semana selecionada. Somente semanas futuras podem ser importadas.
              </div>
            )}

            {arquivoNome && (
              <p className="text-xs text-gray-500">Arquivo selecionado: {arquivoNome}</p>
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
          </div>
        </Card>
        {processandoArquivo && (
          <Card>
            <div className="py-6">
              <Loading text="Processando planilha..." />
            </div>
          </Card>
        )}
        {linhas.length > 0 && (
          <Card title="Pré-visualização da importação">
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Incluir
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Categoria
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Associação
                      </th>
                      {datasTabela.map((data) => (
                        <th
                          key={data}
                          className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500"
                        >
                          {formatarDataPt(data)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white/80">
                    {linhas.map((linha) => {
                      const contaRelacionada = encontrarContaPorId(contas, linha.contaId);
                      const areaRelacionada = encontrarAreaPorId(areas, linha.areaId);
                      const tipoRelacionado = encontrarTipoPorId(tiposReceita, linha.tipoReceitaId);
                      return (
                        <React.Fragment key={linha.id}>
                          <tr>
                            <td className="px-3 py-2 align-top">
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                                checked={linha.selecionado}
                                onChange={(event) => handleToggleLinha(linha.id, event.target.checked)}
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-900">{linha.titulo}</span>
                                <span className="text-xs text-gray-400 uppercase">{linha.tipo}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              {linha.tipo === 'gasto' ? (
                                <select
                                  className="w-56 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  value={linha.areaId ?? ''}
                                  onChange={(event) =>
                                    handleAreaChange(
                                      linha.id,
                                      event.target.value ? Number(event.target.value) : null,
                                    )
                                  }
                                >
                                  <option value="">Selecione uma área</option>
                                  {areas.map((area) => (
                                    <option key={area.id} value={area.id}>
                                      {area.nome}
                                    </option>
                                  ))}
                                </select>
                              ) : linha.tipo === 'receita' ? (
                                <div className="flex flex-col gap-2">
                                  <select
                                    className="w-64 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    value={linha.contaId ?? ''}
                                    onChange={(event) =>
                                      handleContaChange(
                                        linha.id,
                                        event.target.value ? Number(event.target.value) : null,
                                      )
                                    }
                                  >
                                    <option value="">Selecione uma conta</option>
                                    {contas.map((conta) => (
                                      <option key={conta.id} value={conta.id}>
                                        {conta.nome}
                                        {conta.bancoNome ? ` • ${conta.bancoNome}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    className="w-64 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    value={linha.tipoReceitaId ?? ''}
                                    onChange={(event) =>
                                      handleTipoReceitaChange(
                                        linha.id,
                                        event.target.value ? Number(event.target.value) : null,
                                      )
                                    }
                                  >
                                    <option value="">Tipo de receita</option>
                                    {tiposReceita.map((tipo) => (
                                      <option key={tipo.id} value={tipo.id}>
                                        {tipo.nome}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-500">Saldo inicial</span>
                              )}
                            </td>
                            {linha.valores.map((valor) => (
                              <td key={valor.data} className="px-3 py-2 align-top text-right">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  pattern="[0-9.,-]*"
                                  placeholder="0,00"
                                  autoComplete="off"
                                  className="w-28 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  value={valor.texto}
                                  onChange={(event) =>
                                    handleValorChange(linha.id, valor.data, event.target.value)
                                  }
                                  onBlur={() => handleValorBlur(linha.id, valor.data)}
                                  disabled={linha.tipo === 'saldo_inicial' && valor.data !== datasTabela[0]}
                                />
                              </td>
                            ))}
                          </tr>
                          {linha.erros.length > 0 && (
                            <tr>
                              <td colSpan={3 + datasTabela.length} className="bg-error-50 px-3 py-2 text-xs text-error-700">
                                {linha.erros.join(' ')}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total de receitas</p>
                  <p className="mt-2 text-2xl font-semibold text-success-700">
                    {formatCurrency(totaisReceita.reduce((acc, valor) => acc + valor, 0))}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total de gastos</p>
                  <p className="mt-2 text-2xl font-semibold text-error-700">
                    {formatCurrency(totaisGasto.reduce((acc, valor) => acc + valor, 0))}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo inicial</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(saldoInicialValor)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo acumulado final</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {formatCurrency(saldoAcumuladoPrevisto[saldoAcumuladoPrevisto.length - 1] ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}
        <Card title="Previsão registrada">
          {carregandoPrevisao ? (
            <div className="py-6">
              <Loading text="Buscando dados registrados..." />
            </div>
          ) : !previsaoExistente ? (
            <p className="text-sm text-gray-500">
              Nenhum dado foi importado para a semana selecionada até o momento.
            </p>
          ) : previsaoExistente.itens.length === 0 ? (
            <p className="text-sm text-gray-500">
              A semana selecionada está cadastrada, mas ainda não possui itens importados.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Status atual: <span className="font-semibold text-gray-900">{previsaoExistente.status}</span>
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Data</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Tipo</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Categoria</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Associação</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white/80">
                    {previsaoExistente.itens.map((item) => {
                      const conta = encontrarContaPorId(contas, item.contaId);
                      const area = encontrarAreaPorId(areas, item.areaId);
                      const banco = bancos.find((b) => b.id === item.bancoId) ?? null;
                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-gray-700">{formatarDataPt(item.data)}</td>
                          <td className="px-3 py-2 text-gray-700">{item.tipo}</td>
                          <td className="px-3 py-2 text-gray-700">{item.categoria}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {item.tipo === 'receita' && conta
                              ? `${conta.nome}${conta.bancoNome ? ` • ${conta.bancoNome}` : ''}`
                              : item.tipo === 'gasto' && area
                              ? area.nome
                              : banco
                              ? banco.nome
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                            {formatCurrency(item.valor)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
};

export default LancamentoPrevisaoSemanalPage;
