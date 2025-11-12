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
  are_areas?: MaybeArray<{ are_nome?: unknown } | null>;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_nome?: unknown } | null>;
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
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
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

const obterCategoriaReceita = (codigo: string | null | undefined): CategoriaReceita => {
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
  return ((realizado - previsto) / previsto) * 100;
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
): LinhaComparativa[] =>
  Array.from(mapa.entries())
    .map(([chave, item]) => {
      const previsto = arredondar(item.previsto);
      const realizado = arredondar(item.realizado);
      const desvio = arredondar(realizado - previsto);
      const percentual = calcularPercentual(previsto, realizado);
      return { chave, titulo: item.titulo, previsto, realizado, desvio, percentual };
    })
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));

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
        const [previsoesRes, gastosRes, receitasRes, saldosRes] = await Promise.all([
          supabase
            .from('pvi_previsao_itens')
            .select(
              'pvi_tipo, pvi_categoria, pvi_valor, pvi_are_id, pvi_ctr_id, pvi_ban_id, are_areas(are_nome), ctr_contas_receita(ctr_nome, ctr_codigo), ban_bancos(ban_nome), tpr_tipos_receita(tpr_nome)',
            )
            .eq('pvi_data', data),
          supabase
            .from('pag_pagamentos_area')
            .select('pag_valor, pag_are_id, are_areas(are_nome)')
            .eq('pag_data', data),
          supabase
            .from('rec_receitas')
            .select('rec_valor, rec_ctr_id, ctr_contas_receita(ctr_nome, ctr_codigo)')
            .eq('rec_data', data),
          supabase
            .from('sdb_saldo_banco')
            .select('sdb_saldo, sdb_ban_id, ban_bancos(ban_nome)')
            .eq('sdb_data', data),
        ]);

        if (previsoesRes.error) throw previsoesRes.error;
        if (gastosRes.error) throw gastosRes.error;
        if (receitasRes.error) throw receitasRes.error;
        if (saldosRes.error) throw saldosRes.error;

        const previsoes = normalizeRelation(previsoesRes.data as MaybeArray<PrevisaoRow>);
        const pagamentosArea = (gastosRes.data as MaybeArray<PagamentoAreaRow>) ?? [];
        const receitas = (receitasRes.data as MaybeArray<ReceitaRow>) ?? [];
        const saldosBancarios = (saldosRes.data as MaybeArray<SaldoBancoRow>) ?? [];

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
            const codigo = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : null;
            const categoria = obterCategoriaReceita(codigo);
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

        normalizeRelation(receitas).forEach((item) => {
          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const codigo = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : null;
          const categoria = obterCategoriaReceita(codigo);
          const titulo = categoriaRotulos[categoria];
          const chave = categoria;
          const existente = mapaReceitas.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
          existente.realizado += arredondar(toNumber(item.rec_valor));
          mapaReceitas.set(chave, existente);
        });

        normalizeRelation(saldosBancarios).forEach((item) => {
          const bancoRel = normalizeRelation(item.ban_bancos)[0];
          const bancoTitulo = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
          const bancoId = toString(item.sdb_ban_id, 'sem-banco');
          const chave = `${bancoId}-${bancoTitulo.toLowerCase()}`;
          const existente = mapaBancos.get(chave) ?? { titulo: bancoTitulo, previsto: 0, realizado: 0 };
          existente.realizado += arredondar(toNumber(item.sdb_saldo));
          mapaBancos.set(chave, existente);
        });

        const gastos = converterMapaParaLinhas(mapaGastos);
        const receitasComparativo = converterMapaParaLinhas(mapaReceitas);
        const bancos = converterMapaParaLinhas(mapaBancos);

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

        const saldoFinalRealizado = arredondar(totalBancosRealizados);
        const saldoInicialRealizado = arredondar(saldoFinalRealizado - resultadoRealizado);

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
                  <th>Categoria</th>
                  <th>Previsto</th>
                  <th>Realizado</th>
                  <th>Desvio</th>
                  <th>% Desvio</th>
                </tr>
              ) : (
                <tr>
                  <th>Banco / Conta</th>
                  <th>Realizado</th>
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
                    <td className={linha.desvio >= 0 ? 'report-value--positivo' : 'report-value--negativo'}>
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
              <tfoot>
                {layout === 'comparativo' ? (
                  <tr>
                    <td>{totalLabel}</td>
                    <td>{formatCurrency(totalPrevisto)}</td>
                    <td>{formatCurrency(totalRealizado)}</td>
                    <td className={totalDesvio >= 0 ? 'report-value--positivo' : 'report-value--negativo'}>
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
    const margemHorizontal = 14;
    const larguraUtil = doc.internal.pageSize.getWidth() - margemHorizontal * 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Saldo Diário', margemHorizontal, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Data de referência: ${formatarDataPt(relatorio.data)}`, margemHorizontal, 20);

    const resumoLinha = `Receitas: ${formatCurrency(relatorio.resumo.totalReceitasRealizadas)}  |  Despesas: ${formatCurrency(relatorio.resumo.totalDespesasRealizadas)}  |  Resultado: ${formatCurrency(relatorio.resumo.resultadoRealizado)}  |  Saldos em Bancos: ${formatCurrency(relatorio.resumo.bancosRealizados)}`;
    doc.setFontSize(9);
    const resumoQuebrado = doc.splitTextToSize(resumoLinha, larguraUtil);
    doc.text(resumoQuebrado, margemHorizontal, 26);

    let posicaoAtual = 26 + resumoQuebrado.length * 5;

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
      posicaoAtual += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
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
        startY: posicaoAtual + 2,
        head: cabecalho,
        body: corpo,
        foot: rodape,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, halign: 'right' },
        headStyles: {
          fillColor: tabelaAccentPdfColors[accent] ?? tabelaAccentPdfColors.azul,
          textColor: 255,
          fontStyle: 'bold',
        },
        bodyStyles: { halign: 'right' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { halign: 'left' } },
        margin: { left: margemHorizontal, right: margemHorizontal },
        footStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [33, 37, 41] },
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

    adicionarTabela('Resultado de Saldo de Caixa do Dia', linhasResultadoCaixa, {
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
              })}
              {renderTabelaComparativa('Receitas por Categoria', relatorio.receitas, {
                accent: 'verde',
                totalLabel: 'Total de Receitas',
              })}
            </div>

            {renderTabelaComparativa('Resultado de Saldo de Caixa do Dia', linhasResultadoCaixa, {
              accent: 'laranja',
              showTotals: false,
            })}

            <div className="report-grid report-grid--two">
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
