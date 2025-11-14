'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading, Modal, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import {
  getOrCreateUser,
  getSupabaseClient,
  type UsuarioRow,
} from '@/lib/supabaseClient';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';
import { getUserSession } from '@/lib/userSession';

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

type MaybeArray<T> = T | T[] | null | undefined;

type PrevisaoRow = {
  pvi_tipo?: unknown;
  pvi_categoria?: unknown;
  pvi_valor?: unknown;
  pvi_are_id?: unknown;
  pvi_ctr_id?: unknown;
  pvi_ban_id?: unknown;
  pvi_tpr_id?: unknown;
  are_areas?: MaybeArray<{ are_nome?: unknown } | null>;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_id?: unknown; tpr_nome?: unknown } | null>;
};

type PagamentoAreaRow = {
  pag_valor?: unknown;
  pag_are_id?: unknown;
  are_areas?: MaybeArray<{ are_nome?: unknown } | null>;
};

type ReceitaRow = {
  rec_valor?: unknown;
  rec_ctr_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
};

type SaldoBancoRow = {
  sdb_saldo?: unknown;
  sdb_ban_id?: unknown;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown; ban_numero_conta?: unknown } | null>;
};

type CategoriaReceita = 'depositos' | 'titulos' | 'outras';

type LinhaComparativa = {
  chave: string;
  titulo: string;
  previsto: number;
  realizado: number;
  desvio: number;
  percentual: number | null;
};

type LinhaRealizada = {
  chave: string;
  titulo: string;
  realizado: number;
};

type LinhaTabela = LinhaComparativa | LinhaRealizada;

type TabelaAccent = 'azul' | 'verde' | 'amarelo' | 'laranja' | 'cinza';

type RenderTabelaOptions = {
  accent?: TabelaAccent;
  totalLabel?: string;
  showTotals?: boolean;
  layout?: 'comparativo' | 'realizado';
  inverterCores?: boolean;
};

type RelatorioSaldoDiario = {
  data: string;
  gastos: LinhaComparativa[];
  receitas: LinhaComparativa[];
  bancos: LinhaComparativa[];
  resumo: {
    saldoInicialPrevisto: number;
    saldoInicialRealizado: number;
    totalReceitasPrevistas: number;
    totalReceitasRealizadas: number;
    totalDespesasPrevistas: number;
    totalDespesasRealizadas: number;
    resultadoPrevisto: number;
    resultadoRealizado: number;
    saldoFinalPrevisto: number;
    saldoFinalRealizado: number;
    bancosPrevistos: number;
    bancosRealizados: number;
  };
};

const normalizeRelation = <T,>(value: MaybeArray<T>): Exclude<T, null | undefined>[] => {
  if (!value) {
    return [];
  }
  const arrayValue = Array.isArray(value) ? value : [value];
  return arrayValue.filter((item): item is Exclude<T, null | undefined> => item != null);
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
};

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

const obterOrdemArea = (nomeArea: string): number => {
  const nomeNormalizado = nomeArea.trim().toUpperCase();
  const ordemAreas: Record<string, number> = {
    'GASTO COM MATERIAL E CONSUMO': 1,
    'MATERIAL E CONSUMO': 1,
    'GASTO RH': 2,
    'RH': 2,
    'GASTO FINANCEIRO E FISCAL': 3,
    'FINANCEIRO E FISCAL': 3,
    'GASTO LOGISTICA': 4,
    'LOGISTICA': 4,
    'GASTO COMERCIAL': 5,
    'COMERCIAL': 5,
    'GASTO MARKETING': 6,
    'MARKETING': 6,
    'GASTO LOJA DE FABRICA': 7,
    'LOJA DE FABRICA': 7,
    'GASTO TI': 8,
    'TI': 8,
    'GASTO DIRETORIA': 9,
    'DIRETORIA': 9,
    'GASTO COMPRAS': 10,
    'COMPRAS': 10,
    'GASTO INVESTIMENTO': 11,
    'INVESTIMENTO': 11,
    'GASTO DALLAS': 12,
    'DALLAS': 12,
    'TRANSFERÊNCIA PARA APLICAÇÃO': 13,
    'TRANSFERENCIA PARA APLICACAO': 13,
    'APLICACAO': 13,
  };

  // Procura pela chave exata
  if (ordemAreas[nomeNormalizado] !== undefined) {
    return ordemAreas[nomeNormalizado];
  }

  // Procura se contém alguma das palavras-chave
  for (const [chave, ordem] of Object.entries(ordemAreas)) {
    if (nomeNormalizado.includes(chave)) {
      return ordem;
    }
  }

  // Se não encontrou, retorna um valor alto para aparecer no final
  return 999;
};

const obterCategoriaReceita = (tprId: number | null | undefined, codigo: string | null | undefined): CategoriaReceita => {
  // Primeiro tenta usar o tpr_id (mais confiável)
  if (tprId !== null && tprId !== undefined && Number.isFinite(tprId)) {
    const tprIdNumero = Number(tprId);
    if (tprIdNumero === 1) return 'titulos';  // Receitas em Títulos/Boletos
    if (tprIdNumero === 2) return 'depositos'; // Receitas em Depósitos/PIX
    if (tprIdNumero === 3) return 'outras';   // Outras Receitas
  }

  // Fallback: usa o código da conta de receita
  if (!codigo) {
    return 'outras';
  }
  const normalizado = codigo.trim();
  if (normalizado.startsWith('200')) return 'titulos';
  if (normalizado.startsWith('201')) return 'depositos';
  if (normalizado.startsWith('202')) return 'outras';
  return 'outras';
};

const categoriaRotulos: Record<CategoriaReceita, string> = {
  depositos: 'Receitas - Depósitos e PIX',
  titulos: 'Receitas - Títulos (Boletos)',
  outras: 'Receitas - Outras Entradas',
};

const tabelaAccentClassNames: Record<TabelaAccent, string> = {
  azul: 'report-section report-section--azul',
  verde: 'report-section report-section--verde',
  amarelo: 'report-section report-section--amarelo',
  laranja: 'report-section report-section--laranja',
  cinza: 'report-section report-section--cinza',
};

const tabelaAccentPdfColors: Record<TabelaAccent, [number, number, number]> = {
  azul: [31, 73, 125],
  verde: [27, 94, 32],
  amarelo: [183, 121, 31],
  laranja: [156, 66, 33],
  cinza: [75, 85, 99],
};

const calcularPercentual = (previsto: number, realizado: number): number | null => {
  if (Math.abs(previsto) < 0.0001) {
    return null;
  }
  const diferenca = previsto - realizado;
  return (diferenca / previsto) * 100;
};

const formatarPercentual = (valor: number | null): string => {
  if (valor === null || Number.isNaN(valor)) {
    return '—';
  }
  const arredondado = Math.round(valor * 10) / 10;
  return `${arredondado.toFixed(1).replace('.', ',')}%`;
};

const converterMapaParaLinhas = (
  mapa: Map<string, { titulo: string; previsto: number; realizado: number }>,
  ordenarPorArea: boolean = false,
): LinhaComparativa[] =>
  Array.from(mapa.entries())
    .map(([chave, item]) => {
      const previsto = arredondar(item.previsto);
      const realizado = arredondar(item.realizado);
      const desvio = arredondar(realizado - previsto);
      const percentual = calcularPercentual(previsto, realizado);
      return { chave, titulo: item.titulo, previsto, realizado, desvio, percentual };
    })
    .sort((a, b) => {
      if (ordenarPorArea) {
        const ordemA = obterOrdemArea(a.titulo);
        const ordemB = obterOrdemArea(b.titulo);
        if (ordemA !== ordemB) {
          return ordemA - ordemB;
        }
      }
      return a.titulo.localeCompare(b.titulo, 'pt-BR');
    });

const somarPrevisto = (linhas: LinhaTabela[]): number =>
  arredondar(
    linhas.reduce((acc, linha) => acc + ('previsto' in linha && typeof linha.previsto === 'number' ? linha.previsto : 0), 0),
  );

const somarRealizado = (linhas: LinhaTabela[]): number =>
  arredondar(linhas.reduce((acc, linha) => acc + linha.realizado, 0));

const RelatorioSaldoDiarioPage: React.FC = () => {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregandoUsuario, setCarregandoUsuario] = useState(true);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dataReferencia, setDataReferencia] = useState(() => toISODate(new Date()));
  const [relatorio, setRelatorio] = useState<RelatorioSaldoDiario | null>(null);
  const [emailModalAberto, setEmailModalAberto] = useState(false);
  const [emailDestino, setEmailDestino] = useState('');
  const [emailMensagem, setEmailMensagem] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [feedbackEmail, setFeedbackEmail] = useState<string | null>(null);

  const carregarUsuario = useCallback(async () => {
    try {
      setCarregandoUsuario(true);
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
        setErro('Não foi possível identificar o usuário autenticado.');
        return;
      }
      setUsuario(data);
      setErro(null);
    } catch (error) {
      console.error('Erro ao carregar usuário para o relatório de saldo diário:', error);
      setErro(
        traduzirErroSupabase(
          error,
          'Não foi possível carregar as informações iniciais. Tente novamente mais tarde.',
        ),
      );
    } finally {
      setCarregandoUsuario(false);
    }
  }, []);

  useEffect(() => {
    carregarUsuario();
  }, [carregarUsuario]);

  const carregarRelatorio = useCallback(
    async (usuarioAtual: UsuarioRow, data: string) => {
      try {
        setCarregandoDados(true);
        const supabase = getSupabaseClient();

        // Todos os usuários podem visualizar todos os dados
        const [previsoesRes, gastosRes, receitasRes, saldosRes, saldosAnterioresRes] = await Promise.all([
          supabase
            .from('pvi_previsao_itens')
            .select(
              'pvi_tipo, pvi_categoria, pvi_valor, pvi_are_id, pvi_ctr_id, pvi_ban_id, pvi_tpr_id, are_areas(are_nome), ctr_contas_receita(ctr_nome, ctr_codigo), ban_bancos(ban_nome), tpr_tipos_receita(tpr_id, tpr_nome)',
            )
            .eq('pvi_data', data),
          supabase
            .from('pag_pagamentos_area')
            .select('pag_valor, pag_are_id, are_areas(are_nome)')
            .eq('pag_data', data),
          supabase
            .from('rec_receitas')
            .select('rec_id, rec_valor, rec_ctr_id, ctr_contas_receita(ctr_nome, ctr_codigo)')
            .eq('rec_data', data),
          supabase
            .from('sdb_saldo_banco')
            .select('sdb_saldo, sdb_ban_id, ban_bancos(ban_nome, ban_numero_conta)')
            .eq('sdb_data', data),
          // Buscar saldos bancários da última data anterior disponível
          supabase
            .from('sdb_saldo_banco')
            .select('sdb_data, sdb_saldo')
            .lt('sdb_data', data)
            .order('sdb_data', { ascending: false })
            .limit(100), // Pegamos vários registros para encontrar a última data completa
        ]);

        if (previsoesRes.error) throw previsoesRes.error;
        if (gastosRes.error) throw gastosRes.error;
        if (receitasRes.error) throw receitasRes.error;
        if (saldosRes.error) throw saldosRes.error;
        if (saldosAnterioresRes.error) throw saldosAnterioresRes.error;

        const previsoes = normalizeRelation(previsoesRes.data as MaybeArray<PrevisaoRow>);
        const pagamentosArea = (gastosRes.data as MaybeArray<PagamentoAreaRow>) ?? [];
        const receitas = (receitasRes.data as MaybeArray<ReceitaRow>) ?? [];
        const saldosBancarios = (saldosRes.data as MaybeArray<SaldoBancoRow>) ?? [];
        const saldosAnterioresData = (saldosAnterioresRes.data as any[]) ?? [];

        // Calcular saldo anterior: pegar a última data disponível e somar todos os saldos
        let saldoAnteriorCalculado = 0;
        if (saldosAnterioresData.length > 0) {
          const ultimaData = saldosAnterioresData[0].sdb_data;
          saldoAnteriorCalculado = saldosAnterioresData
            .filter((s: any) => s.sdb_data === ultimaData)
            .reduce((acc: number, s: any) => acc + arredondar(toNumber(s.sdb_saldo)), 0);
        }

        const mapaGastos = new Map<string, { titulo: string; previsto: number; realizado: number }>();
        const mapaReceitas = new Map<string, { titulo: string; previsto: number; realizado: number }>();
        const mapaBancos = new Map<string, { titulo: string; previsto: number; realizado: number }>();

        let saldoInicialPrevisto = 0;
        let saldoFinalPrevisto = 0;

        previsoes.forEach((item) => {
          const tipo = toString((item as PrevisaoRow).pvi_tipo).toLowerCase();
          const valor = arredondar(toNumber((item as PrevisaoRow).pvi_valor));
          const areaRel = normalizeRelation((item as PrevisaoRow).are_areas)[0];
          const contaRel = normalizeRelation((item as PrevisaoRow).ctr_contas_receita)[0];
          const bancoRel = normalizeRelation((item as PrevisaoRow).ban_bancos)[0];

          if (tipo === 'gasto') {
            const areaId = toString((item as PrevisaoRow).pvi_are_id, 'sem-area');
            const titulo = areaRel?.are_nome ? toString(areaRel.are_nome) : toString((item as PrevisaoRow).pvi_categoria, 'Área não informada');
            const chave = `${areaId}-${titulo.toLowerCase()}`;
            const existente = mapaGastos.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
            existente.previsto += valor;
            mapaGastos.set(chave, existente);
          }

          if (tipo === 'receita') {
            const tprId = toNumber((item as PrevisaoRow).pvi_tpr_id, 0) || undefined;
            const codigo = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : null;
            const categoria = obterCategoriaReceita(tprId, codigo);
            const titulo = categoriaRotulos[categoria];
            const chave = categoria;
            const existente = mapaReceitas.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
            existente.previsto += valor;
            mapaReceitas.set(chave, existente);

            if ((item as PrevisaoRow).pvi_ban_id !== null && (item as PrevisaoRow).pvi_ban_id !== undefined) {
              const bancoId = toString((item as PrevisaoRow).pvi_ban_id, 'sem-banco');
              const bancoTitulo = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
              const chaveBanco = `${bancoId}-${bancoTitulo.toLowerCase()}`;
              const existenteBanco = mapaBancos.get(chaveBanco) ?? { titulo: bancoTitulo, previsto: 0, realizado: 0 };
              existenteBanco.previsto += valor;
              mapaBancos.set(chaveBanco, existenteBanco);
            }
          }

          if (tipo === 'saldo_inicial') {
            saldoInicialPrevisto += valor;
          }

          if (tipo === 'saldo_acumulado') {
            saldoFinalPrevisto = valor;
          }
        });

        normalizeRelation(pagamentosArea).forEach((item) => {
          const areaId = toString(item.pag_are_id, 'sem-area');
          const areaRel = normalizeRelation(item.are_areas)[0];
          const titulo = areaRel?.are_nome ? toString(areaRel.are_nome) : 'Área não informada';
          const chave = `${areaId}-${titulo.toLowerCase()}`;
          const existente = mapaGastos.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
          existente.realizado += arredondar(toNumber(item.pag_valor));
          mapaGastos.set(chave, existente);
        });

        // Remover duplicatas usando um Set para rastrear rec_id únicos
        const receitasUnicas = new Map<number, ReceitaRow>();
        normalizeRelation(receitas).forEach((item: any) => {
          const recId = item.rec_id;
          if (recId && !receitasUnicas.has(recId)) {
            receitasUnicas.set(recId, item);
          } else if (!recId) {
            // Se não tiver rec_id (improvável), adicionar mesmo assim
            receitasUnicas.set(Math.random(), item);
          }
        });

        Array.from(receitasUnicas.values()).forEach((item) => {
          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const codigo = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : null;
          // rec_receitas não tem pvi_tpr_id, então usa apenas o código da conta
          const categoria = obterCategoriaReceita(undefined, codigo);
          const titulo = categoriaRotulos[categoria];
          const chave = categoria;
          const existente = mapaReceitas.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
          existente.realizado += arredondar(toNumber(item.rec_valor));
          mapaReceitas.set(chave, existente);
        });

        normalizeRelation(saldosBancarios).forEach((item) => {
          const bancoRel = normalizeRelation(item.ban_bancos)[0];
          const bancoNome = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
          const bancoConta = bancoRel?.ban_numero_conta ? toString(bancoRel.ban_numero_conta) : '';
          const bancoTitulo = bancoConta ? `${bancoNome} / ${bancoConta}` : bancoNome;
          const bancoId = toString(item.sdb_ban_id, 'sem-banco');
          const chave = `${bancoId}-${bancoNome.toLowerCase()}`;
          const existente = mapaBancos.get(chave) ?? { titulo: bancoTitulo, previsto: 0, realizado: 0 };
          existente.realizado += arredondar(toNumber(item.sdb_saldo));
          mapaBancos.set(chave, existente);
        });

        const gastos = converterMapaParaLinhas(mapaGastos, true);
        const receitasComparativo = converterMapaParaLinhas(mapaReceitas, false);
        const bancos = converterMapaParaLinhas(mapaBancos, false);

        const totalDespesasPrevistas = somarPrevisto(gastos);
        const totalDespesasRealizadas = somarRealizado(gastos);
        const totalReceitasPrevistas = somarPrevisto(receitasComparativo);
        const totalReceitasRealizadas = somarRealizado(receitasComparativo);
        const totalBancosPrevistos = somarPrevisto(bancos);
        const totalBancosRealizados = somarRealizado(bancos);

        const resultadoPrevisto = arredondar(totalReceitasPrevistas - totalDespesasPrevistas);
        const resultadoRealizado = arredondar(totalReceitasRealizadas - totalDespesasRealizadas);

        if (saldoFinalPrevisto === 0) {
          saldoFinalPrevisto = arredondar(saldoInicialPrevisto + resultadoPrevisto);
        }

        // Usar o saldo anterior baseado na última data disponível nos registros bancários
        const saldoInicialRealizado = arredondar(saldoAnteriorCalculado);

        // Calcular saldo final do dia: saldo anterior + receitas realizadas - despesas realizadas
        const saldoFinalRealizado = arredondar(
          saldoInicialRealizado + totalReceitasRealizadas - totalDespesasRealizadas
        );

        setRelatorio({
          data,
          gastos,
          receitas: receitasComparativo,
          bancos,
          resumo: {
            saldoInicialPrevisto: arredondar(saldoInicialPrevisto),
            saldoInicialRealizado,
            totalReceitasPrevistas,
            totalReceitasRealizadas,
            totalDespesasPrevistas,
            totalDespesasRealizadas,
            resultadoPrevisto,
            resultadoRealizado,
            saldoFinalPrevisto,
            saldoFinalRealizado,
            bancosPrevistos: totalBancosPrevistos,
            bancosRealizados: totalBancosRealizados,
          },
        });
        setErro(null);
      } catch (error) {
        console.error('Erro ao carregar relatório de saldo diário:', error);
        setRelatorio(null);
        setErro(
          traduzirErroSupabase(
            error,
            'Não foi possível carregar o relatório de saldo diário para a data selecionada.',
          ),
        );
      } finally {
        setCarregandoDados(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!usuario) {
      return;
    }
    carregarRelatorio(usuario, dataReferencia);
  }, [usuario, dataReferencia, carregarRelatorio]);

  const renderTabelaComparativa = useCallback(
    (titulo: string, linhas: LinhaTabela[], options: RenderTabelaOptions = {}) => {
      const layout = options.layout ?? 'comparativo';
      const accent = options.accent ?? 'azul';
      const totalLabel = options.totalLabel ?? 'Totais';
      const showTotals = options.showTotals ?? layout === 'comparativo';
      const inverterCores = options.inverterCores ?? false;
      const sectionClass = tabelaAccentClassNames[accent] ?? tabelaAccentClassNames.azul;

      const linhasComparativas =
        layout === 'comparativo'
          ? linhas.filter(
              (linha): linha is LinhaComparativa =>
                'previsto' in linha &&
                typeof linha.previsto === 'number' &&
                'desvio' in linha &&
                typeof linha.desvio === 'number',
            )
          : [];
      const linhasParaComparativo =
        layout === 'comparativo'
          ? linhasComparativas.length > 0
            ? linhasComparativas
            : (linhas as LinhaComparativa[])
          : [];

      const linhasParaExibir = layout === 'comparativo' ? linhasParaComparativo : linhas;

      const totalPrevisto =
        layout === 'comparativo' ? somarPrevisto(linhasParaComparativo) : 0;
      const totalRealizado =
        layout === 'comparativo' ? somarRealizado(linhasParaComparativo) : somarRealizado(linhas);
      const totalDesvio = layout === 'comparativo' ? arredondar(totalRealizado - totalPrevisto) : 0;
      const totalPercentual =
        layout === 'comparativo' ? calcularPercentual(totalPrevisto, totalRealizado) : null;
      const colSpan = layout === 'comparativo' ? 5 : 2;

      return (
        <div className={sectionClass}>
          <div className="report-section__header">
            <span>{titulo}</span>
          </div>
          <table className="report-section__table">
            <thead>
              {layout === 'comparativo' ? (
                <tr>
                  <th className="text-center">Categoria</th>
                  <th className="text-center">Previsto</th>
                  <th className="text-center">Realizado</th>
                  <th className="text-center">Desvio</th>
                  <th className="text-center">% Desvio</th>
                </tr>
              ) : (
                <tr>
                  <th className="text-center">Banco / Conta</th>
                  <th className="text-center">Realizado</th>
                </tr>
              )}
            </thead>
            <tbody>
              {linhasParaExibir.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="report-section__empty-cell">
                    Nenhuma informação encontrada para esta seção.
                  </td>
                </tr>
              ) : layout === 'comparativo' ? (
                linhasParaComparativo.map((linha) => (
                  <tr key={linha.chave}>
                    <td>{linha.titulo}</td>
                    <td>{formatCurrency(linha.previsto)}</td>
                    <td>{formatCurrency(linha.realizado)}</td>
                    <td className={
                      inverterCores
                        ? (linha.desvio >= 0 ? 'report-value--negativo' : 'report-value--positivo')
                        : (linha.desvio >= 0 ? 'report-value--positivo' : 'report-value--negativo')
                    }>
                      {formatCurrency(linha.desvio)}
                    </td>
                    <td>{formatarPercentual(linha.percentual)}</td>
                  </tr>
                ))
              ) : (
                linhas.map((linha) => (
                  <tr key={linha.chave}>
                    <td>{linha.titulo}</td>
                    <td>{formatCurrency(linha.realizado)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {showTotals && (
              <tfoot className="border-t-2 border-gray-400">
                {layout === 'comparativo' ? (
                  <tr>
                    <td>{totalLabel}</td>
                    <td>{formatCurrency(totalPrevisto)}</td>
                    <td>{formatCurrency(totalRealizado)}</td>
                    <td className={
                      inverterCores
                        ? (totalDesvio >= 0 ? 'report-value--negativo' : 'report-value--positivo')
                        : (totalDesvio >= 0 ? 'report-value--positivo' : 'report-value--negativo')
                    }>
                      {formatCurrency(totalDesvio)}
                    </td>
                    <td>{formatarPercentual(totalPercentual)}</td>
                  </tr>
                ) : (
                  <tr>
                    <td>{totalLabel}</td>
                    <td>{formatCurrency(totalRealizado)}</td>
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>
      );
    },
    [],
  );

  const linhasResultadoCaixa = useMemo(() => {
    if (!relatorio) {
      return [];
    }
    const { resumo } = relatorio;
    return [
      {
        chave: 'receitas-dia',
        titulo: 'Entradas do Dia (Receitas)',
        previsto: resumo.totalReceitasPrevistas,
        realizado: resumo.totalReceitasRealizadas,
        desvio: arredondar(resumo.totalReceitasRealizadas - resumo.totalReceitasPrevistas),
        percentual: calcularPercentual(resumo.totalReceitasPrevistas, resumo.totalReceitasRealizadas),
      },
      {
        chave: 'despesas-dia',
        titulo: 'Saídas do Dia (Despesas)',
        previsto: resumo.totalDespesasPrevistas,
        realizado: resumo.totalDespesasRealizadas,
        desvio: arredondar(resumo.totalDespesasRealizadas - resumo.totalDespesasPrevistas),
        percentual: calcularPercentual(resumo.totalDespesasPrevistas, resumo.totalDespesasRealizadas),
      },
      {
        chave: 'resultado-dia',
        titulo: 'Saldo Operacional do Dia',
        previsto: resumo.resultadoPrevisto,
        realizado: resumo.resultadoRealizado,
        desvio: arredondar(resumo.resultadoRealizado - resumo.resultadoPrevisto),
        percentual: calcularPercentual(resumo.resultadoPrevisto, resumo.resultadoRealizado),
      },
    ];
  }, [relatorio]);

  const linhasResumoGeral = useMemo<LinhaRealizada[]>(() => {
    if (!relatorio) {
      return [];
    }
    const { resumo } = relatorio;
    return [
      {
        chave: 'saldo-anterior',
        titulo: 'Saldo do Dia Anterior',
        realizado: resumo.saldoInicialRealizado,
      },
      {
        chave: 'resultado',
        titulo: 'Resultado do Dia (Receitas - Despesas)',
        realizado: resumo.resultadoRealizado,
      },
      {
        chave: 'saldo-final',
        titulo: 'Saldo Final do Dia',
        realizado: resumo.saldoFinalRealizado,
      },
    ];
  }, [relatorio]);

  const gerarDocumentoPdf = useCallback(() => {
    if (!relatorio) {
      return null;
    }

    const doc = new jsPDF('portrait', 'mm', 'a4');
    const margemHorizontal = 10;
    const larguraUtil = doc.internal.pageSize.getWidth() - margemHorizontal * 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Saldo Diário', margemHorizontal, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Data: ${formatarDataPt(relatorio.data)}`, margemHorizontal, 17);

    const resumoLinha = `Saldo Inicial: ${formatCurrency(relatorio.resumo.saldoInicialRealizado)} | Rec: ${formatCurrency(relatorio.resumo.totalReceitasRealizadas)} | Desp: ${formatCurrency(relatorio.resumo.totalDespesasRealizadas)} | Saldo do dia: ${formatCurrency(relatorio.resumo.resultadoRealizado)} | Bancos: ${formatCurrency(relatorio.resumo.bancosRealizados)}`;
    doc.setFontSize(7);
    const resumoQuebrado = doc.splitTextToSize(resumoLinha, larguraUtil);
    doc.text(resumoQuebrado, margemHorizontal, 21);

    let posicaoAtual = 21 + resumoQuebrado.length * 3.5;

    type TabelaPdfOptions = {
      layout?: 'comparativo' | 'realizado';
      accent?: TabelaAccent;
      totalLabel?: string;
      showTotals?: boolean;
    };

    const adicionarTabela = (
      titulo: string,
      linhas: LinhaTabela[],
      { layout = 'comparativo', accent = 'azul', totalLabel, showTotals }: TabelaPdfOptions = {},
    ) => {
      posicaoAtual += 10;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(titulo, margemHorizontal, posicaoAtual);

      const cabecalho =
        layout === 'comparativo'
          ? [['Categoria', 'Previsto', 'Realizado', 'Diferença', '%']]
          : [['Banco / Conta', 'Realizado']];

      const linhasComparativas =
        layout === 'comparativo'
          ? linhas.filter(
              (linha): linha is LinhaComparativa =>
                'previsto' in linha &&
                typeof linha.previsto === 'number' &&
                'desvio' in linha &&
                typeof linha.desvio === 'number',
            )
          : [];
      const linhasParaComparativo =
        layout === 'comparativo'
          ? linhasComparativas.length > 0
            ? linhasComparativas
            : (linhas as LinhaComparativa[])
          : [];

      const linhasParaExibir = layout === 'comparativo' ? linhasParaComparativo : linhas;

      const corpo =
        linhasParaExibir.length === 0
          ? layout === 'comparativo'
            ? [['Nenhum registro', '-', '-', '-', '-']]
            : [['Nenhum registro', '-']]
          : layout === 'comparativo'
            ? linhasParaComparativo.map((linha) => [
                linha.titulo,
                formatCurrency(linha.previsto),
                formatCurrency(linha.realizado),
                formatCurrency(linha.desvio),
                formatarPercentual(linha.percentual),
              ])
            : linhas.map((linha) => [linha.titulo, formatCurrency(linha.realizado)]);

      const totalPrevisto =
        layout === 'comparativo' ? somarPrevisto(linhasParaComparativo) : 0;
      const totalRealizado =
        layout === 'comparativo' ? somarRealizado(linhasParaComparativo) : somarRealizado(linhas);
      const totalDesvio = layout === 'comparativo' ? arredondar(totalRealizado - totalPrevisto) : 0;
      const totalPercentual =
        layout === 'comparativo' ? calcularPercentual(totalPrevisto, totalRealizado) : null;
      const deveMostrarTotais = (showTotals ?? layout === 'comparativo') && linhasParaExibir.length > 0;

      const rodape =
        deveMostrarTotais
          ? layout === 'comparativo'
            ? [[
                totalLabel ?? 'Totais',
                formatCurrency(totalPrevisto),
                formatCurrency(totalRealizado),
                formatCurrency(totalDesvio),
                formatarPercentual(totalPercentual),
              ]]
            : [[totalLabel ?? 'Total', formatCurrency(totalRealizado)]]
          : undefined;

      autoTable(doc, {
        startY: posicaoAtual + 1.5,
        head: cabecalho,
        body: corpo,
        foot: rodape,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 1.5, halign: 'right' },
        headStyles: {
          fillColor: tabelaAccentPdfColors[accent] ?? tabelaAccentPdfColors.azul,
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 9,
        },
        bodyStyles: { halign: 'right' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'left', cellWidth: 75 }
        },
        margin: { left: margemHorizontal, right: margemHorizontal },
        footStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [33, 37, 41], fontSize: 9 },
      });

      posicaoAtual = (doc as any).lastAutoTable.finalY;
    };

    adicionarTabela('Gastos por Área', relatorio.gastos, {
      accent: 'amarelo',
      totalLabel: 'Total de Gastos',
    });

    adicionarTabela('Receitas por Categoria', relatorio.receitas, {
      accent: 'verde',
      totalLabel: 'Total de Receitas',
    });

    adicionarTabela('Saldo do dia (receitas - despesas)', linhasResultadoCaixa, {
      accent: 'laranja',
      showTotals: false,
    });

    adicionarTabela('Resumo Geral', linhasResumoGeral, {
      accent: 'azul',
      layout: 'realizado',
      showTotals: false,
    });

    adicionarTabela('Saldos Bancários', relatorio.bancos, {
      accent: 'cinza',
      layout: 'realizado',
      totalLabel: 'Total em Bancos',
      showTotals: true,
    });

    return doc;
  }, [relatorio, linhasResultadoCaixa, linhasResumoGeral]);

  const handleExportPdf = useCallback(() => {
    if (!relatorio) {
      alert('Nenhum relatório disponível para exportar.');
      return;
    }

    const doc = gerarDocumentoPdf();
    if (!doc) {
      alert('Não foi possível gerar o PDF. Tente novamente.');
      return;
    }

    const nomeArquivo = `Saldo_Diario_${relatorio.data.replace(/-/g, '')}.pdf`;
    doc.save(nomeArquivo);
  }, [gerarDocumentoPdf, relatorio]);

  const handleAbrirModalEmail = () => {
    setFeedbackEmail(null);
    if (!emailDestino && usuario?.usr_email) {
      setEmailDestino(usuario.usr_email);
    }
    setEmailModalAberto(true);
  };

  const handleEnviarEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!relatorio) {
      setFeedbackEmail('Nenhum relatório disponível para envio.');
      return;
    }
    if (!emailDestino.trim()) {
      setFeedbackEmail('Informe um destinatário para continuar.');
      return;
    }

    try {
      setEnviandoEmail(true);
      setFeedbackEmail(null);

      const doc = gerarDocumentoPdf();
      if (!doc) {
        throw new Error('Não foi possível gerar o documento.');
      }

      const nomeArquivo = `Saldo_Diario_${relatorio.data.replace(/-/g, '')}.pdf`;
      const blob = doc.output('blob');
      const arquivo = new File([blob], nomeArquivo, { type: 'application/pdf' });

      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };

      if (nav.canShare && nav.share && nav.canShare({ files: [arquivo] })) {
        await nav.share({
          files: [arquivo],
          title: 'Saldo Diário',
          text: emailMensagem || 'Segue relatório de saldo diário.',
        });
        setEmailModalAberto(false);
        return;
      }

      doc.save(nomeArquivo);

      const assunto = encodeURIComponent('Relatório - Saldo Diário');
      const corpo = encodeURIComponent(
        `${emailMensagem || 'Segue relatório de saldo diário.'}\n\nO arquivo foi baixado automaticamente e pode ser anexado ao e-mail.`,
      );
      window.location.href = `mailto:${encodeURIComponent(emailDestino)}?subject=${assunto}&body=${corpo}`;

      setEmailModalAberto(false);
    } catch (error) {
      console.error('Erro ao preparar envio por e-mail:', error);
      setFeedbackEmail('Não foi possível preparar o envio. Tente novamente em instantes.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  if (carregandoUsuario) {
    return (
      <>
        <Header title="Saldo Diário" />
        <div className="page-content flex h-80 items-center justify-center">
          <Loading text="Carregando informações do relatório..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Saldo Diário"
        subtitle={`Data selecionada: ${formatarDataPt(dataReferencia)}`}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="date"
              value={dataReferencia}
              onChange={(event) => setDataReferencia(event.target.value)}
              max={toISODate(new Date())}
            />
            <Button
              variant="secondary"
              onClick={handleAbrirModalEmail}
              disabled={!relatorio || carregandoDados}
            >
              Enviar por e-mail
            </Button>
            <Button variant="primary" onClick={handleExportPdf} disabled={!relatorio || carregandoDados}>
              Exportar PDF
            </Button>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <Card variant="danger" title="Não foi possível carregar o relatório">
            <p className="text-sm text-error-700">{erro}</p>
          </Card>
        )}

        {carregandoDados && (
          <div className="flex justify-center">
            <Loading text="Gerando relatório de saldo diário..." />
          </div>
        )}

        {relatorio && !carregandoDados && (
          <div className="report-wrapper">
            <div className="report-header">
              <div>
                <p className="report-header__title">Saldo Diário</p>
                <p className="report-header__subtitle">Data de referência: {formatarDataPt(relatorio.data)}</p>
              </div>
            </div>

            <div className="report-grid report-grid--two">
              {renderTabelaComparativa('Gastos por Área', relatorio.gastos, {
                accent: 'amarelo',
                totalLabel: 'Total de Gastos',
                inverterCores: true,
              })}
              {renderTabelaComparativa('Receitas por Categoria', relatorio.receitas, {
                accent: 'verde',
                totalLabel: 'Total de Receitas',
              })}
            </div>

            <div className="mt-6">
              {renderTabelaComparativa('Saldo do dia (receitas - despesas)', linhasResultadoCaixa, {
                accent: 'laranja',
                showTotals: false,
              })}
            </div>

            <div className="report-grid report-grid--two mt-6">
              {renderTabelaComparativa('Resumo Geral', linhasResumoGeral, {
                accent: 'azul',
                layout: 'realizado',
                showTotals: false,
              })}
              {renderTabelaComparativa('Saldos Bancários', relatorio.bancos, {
                accent: 'cinza',
                layout: 'realizado',
                totalLabel: 'Total em Bancos',
                showTotals: true,
              })}
            </div>
          </div>
        )}

        {!relatorio && !carregandoDados && !erro && (
          <Card variant="default" title="Nenhum dado encontrado">
            <p className="text-sm text-gray-600">
              Não localizamos informações para a data selecionada. Ajuste o filtro de data e tente novamente.
            </p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={emailModalAberto}
        onClose={() => {
          if (!enviandoEmail) {
            setEmailModalAberto(false);
          }
        }}
        title="Enviar relatório por e-mail"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEmailModalAberto(false)}
              disabled={enviandoEmail}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="email-share-form"
              variant="primary"
              loading={enviandoEmail}
              disabled={enviandoEmail}
            >
              Preparar envio
            </Button>
          </div>
        }
      >
        <form id="email-share-form" onSubmit={handleEnviarEmail} className="space-y-4">
          <Input
            label="Destinatário"
            type="email"
            value={emailDestino}
            onChange={(event) => setEmailDestino(event.target.value)}
            placeholder="usuario@empresa.com.br"
            required
          />
          <Textarea
            label="Mensagem"
            value={emailMensagem}
            onChange={(event) => setEmailMensagem(event.target.value)}
            placeholder="Mensagem opcional para acompanhar o relatório."
            rows={4}
          />
          <p className="text-xs text-gray-500">
            O relatório será gerado em PDF. Se o navegador não suportar compartilhamento direto, o arquivo será baixado
            automaticamente para anexar ao e-mail.
          </p>
          {feedbackEmail && <p className="text-sm text-error-600">{feedbackEmail}</p>}
        </form>
      </Modal>
    </>
  );
};

export default RelatorioSaldoDiarioPage;
