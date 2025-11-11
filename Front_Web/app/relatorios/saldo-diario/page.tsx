'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Header } from '@/components/layout';
import { Button, Card, Loading } from '@/components/ui';
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

type TabelaAccent = 'azul' | 'verde' | 'amarelo' | 'laranja' | 'cinza';

type RenderTabelaOptions = {
  accent?: TabelaAccent;
  totalLabel?: string;
  showTotals?: boolean;
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

const converterMapaParaLinhas = (mapa: Map<string, { titulo: string; previsto: number; realizado: number }>): LinhaComparativa[] =>
  Array.from(mapa.entries())
    .map(([chave, item]) => {
      const previsto = arredondar(item.previsto);
      const realizado = arredondar(item.realizado);
      const desvio = arredondar(realizado - previsto);
      const percentual = calcularPercentual(previsto, realizado);
      return { chave, titulo: item.titulo, previsto, realizado, desvio, percentual };
    })
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));

const somarPrevisto = (linhas: LinhaComparativa[]): number =>
  arredondar(linhas.reduce((acc, linha) => acc + linha.previsto, 0));

const somarRealizado = (linhas: LinhaComparativa[]): number =>
  arredondar(linhas.reduce((acc, linha) => acc + linha.realizado, 0));

const RelatorioSaldoDiarioPage: React.FC = () => {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregandoUsuario, setCarregandoUsuario] = useState(true);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dataReferencia, setDataReferencia] = useState(() => toISODate(new Date()));
  const [relatorio, setRelatorio] = useState<RelatorioSaldoDiario | null>(null);

  const reportRef = useRef<HTMLDivElement | null>(null);

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

  const handleExportPdf = () => {
    if (!reportRef.current) {
      return;
    }

    const html = reportRef.current.innerHTML;
    const titulo = 'Relatório - Saldo Diário';
    const janela = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!janela) {
      return;
    }

    const estilos = `
      * {
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #111827;
        box-sizing: border-box;
      }
      body {
        margin: 24px;
        background-color: #f8fafc;
      }
      h1, h2, h3 {
        margin: 0;
      }
      .report-wrapper {
        max-width: 960px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
        font-size: 12px;
        line-height: 1.45;
      }
      .report-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        border-bottom: 2px solid #1f497d;
        padding-bottom: 16px;
        margin-bottom: 20px;
      }
      .report-header__title {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #1f2937;
      }
      .report-header__subtitle {
        margin-top: 6px;
        font-size: 13px;
        color: #374151;
      }
      .report-header__meta {
        text-align: right;
        font-size: 12px;
        color: #4b5563;
      }
      .report-header__meta strong {
        display: block;
        margin-top: 4px;
        font-size: 16px;
        font-weight: 700;
        color: #111827;
      }
      .report-grid {
        display: grid;
        gap: 16px;
        margin-bottom: 20px;
      }
      .report-grid--two {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .report-section {
        border: 1px solid #d1d5db;
        border-radius: 10px;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }
      .report-section__header {
        padding: 12px 16px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #ffffff;
      }
      .report-section__table {
        width: 100%;
        border-collapse: collapse;
      }
      .report-section__table thead th {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 10px 12px;
        text-align: right;
      }
      .report-section__table tbody td,
      .report-section__table tfoot td {
        padding: 10px 12px;
        font-size: 12px;
        text-align: right;
        border-top: 1px solid #e5e7eb;
      }
      .report-section__table thead th:first-child,
      .report-section__table tbody td:first-child,
      .report-section__table tfoot td:first-child {
        text-align: left;
      }
      .report-section__table tbody tr:nth-child(even) {
        background: #f9fafb;
      }
      .report-section__table tbody tr:hover {
        background: #edf2f7;
      }
      .report-section__table tfoot td {
        font-weight: 700;
      }
      .report-section__empty-cell {
        padding: 24px 16px;
        text-align: center;
        font-size: 12px;
        color: #6b7280;
      }
      .report-value--positivo {
        color: #047857;
        font-weight: 600;
      }
      .report-value--negativo {
        color: #b91c1c;
        font-weight: 600;
      }
      .report-section--azul .report-section__header {
        background: #1f497d;
      }
      .report-section--azul .report-section__table thead {
        background: #dbe5f1;
        color: #1f497d;
      }
      .report-section--azul .report-section__table tfoot {
        background: #eef3fb;
        color: #1f497d;
      }
      .report-section--verde .report-section__header {
        background: #1b5e20;
      }
      .report-section--verde .report-section__table thead {
        background: #d7f2e3;
        color: #1b5e20;
      }
      .report-section--verde .report-section__table tfoot {
        background: #ebf7ef;
        color: #1b5e20;
      }
      .report-section--amarelo .report-section__header {
        background: #b7791f;
      }
      .report-section--amarelo .report-section__table thead {
        background: #fcefc7;
        color: #92400e;
      }
      .report-section--amarelo .report-section__table tfoot {
        background: #fef3c7;
        color: #92400e;
      }
      .report-section--laranja .report-section__header {
        background: #9c4221;
      }
      .report-section--laranja .report-section__table thead {
        background: #fde6d9;
        color: #9c4221;
      }
      .report-section--laranja .report-section__table tfoot {
        background: #fce9dc;
        color: #9c4221;
      }
      .report-section--cinza .report-section__header {
        background: #4b5563;
      }
      .report-section--cinza .report-section__table thead {
        background: #e5e7eb;
        color: #111827;
      }
      .report-section--cinza .report-section__table tfoot {
        background: #f3f4f6;
        color: #111827;
      }
      @media print {
        body {
          margin: 10mm;
          background: #ffffff;
        }
        .report-wrapper {
          box-shadow: none;
          page-break-after: avoid;
          page-break-inside: avoid;
        }
        .report-grid {
          break-inside: avoid;
        }
      }
    `;

    const documento = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title><style>${estilos}</style></head><body>${html}</body></html>`;

    // Define o onload ANTES de escrever o documento
    janela.onload = () => {
      setTimeout(() => {
        try {
          janela.focus();
          janela.print();
        } catch (err) {
          console.error('Erro ao imprimir:', err);
          alert('Não foi possível abrir a janela de impressão. Verifique se os popups estão habilitados.');
        }
      }, 1000);
    };

    janela.document.open();
    janela.document.write(documento);
    janela.document.close();
  };

  const renderTabelaComparativa = useCallback(
    (titulo: string, linhas: LinhaComparativa[], options: RenderTabelaOptions = {}) => {
      const totalPrevisto = somarPrevisto(linhas);
      const totalRealizado = somarRealizado(linhas);
      const totalDesvio = arredondar(totalRealizado - totalPrevisto);
      const totalPercentual = calcularPercentual(totalPrevisto, totalRealizado);

      const accent = options.accent ?? 'azul';
      const totalLabel = options.totalLabel ?? 'Totais';
      const showTotals = options.showTotals ?? true;
      const sectionClass = tabelaAccentClassNames[accent] ?? tabelaAccentClassNames.azul;

      return (
        <div className={sectionClass}>
          <div className="report-section__header">
            <span>{titulo}</span>
          </div>
          <table className="report-section__table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Previsto</th>
                <th>Realizado</th>
                <th>Desvio</th>
                <th>% Desvio</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="report-section__empty-cell">
                    Nenhuma informação encontrada para esta seção.
                  </td>
                </tr>
              ) : (
                linhas.map((linha) => (
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
              )}
            </tbody>
            {showTotals && (
              <tfoot>
                <tr>
                  <td>{totalLabel}</td>
                  <td>{formatCurrency(totalPrevisto)}</td>
                  <td>{formatCurrency(totalRealizado)}</td>
                  <td className={totalDesvio >= 0 ? 'report-value--positivo' : 'report-value--negativo'}>
                    {formatCurrency(totalDesvio)}
                  </td>
                  <td>{formatarPercentual(totalPercentual)}</td>
                </tr>
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

  const linhasResumoGeral = useMemo(() => {
    if (!relatorio) {
      return [];
    }
    const { resumo } = relatorio;
    return [
      {
        chave: 'saldo-anterior',
        titulo: 'Saldo do Dia Anterior',
        previsto: resumo.saldoInicialPrevisto,
        realizado: resumo.saldoInicialRealizado,
        desvio: arredondar(resumo.saldoInicialRealizado - resumo.saldoInicialPrevisto),
        percentual: calcularPercentual(resumo.saldoInicialPrevisto, resumo.saldoInicialRealizado),
      },
      {
        chave: 'resultado',
        titulo: 'Resultado do Dia (Receitas - Despesas)',
        previsto: resumo.resultadoPrevisto,
        realizado: resumo.resultadoRealizado,
        desvio: arredondar(resumo.resultadoRealizado - resumo.resultadoPrevisto),
        percentual: calcularPercentual(resumo.resultadoPrevisto, resumo.resultadoRealizado),
      },
      {
        chave: 'saldo-final',
        titulo: 'Saldo Final do Dia',
        previsto: resumo.saldoFinalPrevisto,
        realizado: resumo.saldoFinalRealizado,
        desvio: arredondar(resumo.saldoFinalRealizado - resumo.saldoFinalPrevisto),
        percentual: calcularPercentual(resumo.saldoFinalPrevisto, resumo.saldoFinalRealizado),
      },
      {
        chave: 'saldo-bancos',
        titulo: 'Saldo em Bancos',
        previsto: resumo.bancosPrevistos,
        realizado: resumo.bancosRealizados,
        desvio: arredondar(resumo.bancosRealizados - resumo.bancosPrevistos),
        percentual: calcularPercentual(resumo.bancosPrevistos, resumo.bancosRealizados),
      },
    ];
  }, [relatorio]);

  const dataEmissao = useMemo(() => formatarDataPt(toISODate(new Date())), []);

  const nomeEmpresa = useMemo(() => {
    if (!usuario) {
      return 'EMPRESA';
    }
    const nome = usuario.usr_nome?.trim();
    if (nome && nome.length > 0) {
      return nome.toUpperCase();
    }
    if (usuario.usr_email) {
      const prefixo = usuario.usr_email.split('@')[0];
      if (prefixo) {
        return prefixo.toUpperCase();
      }
    }
    return 'EMPRESA';
  }, [usuario]);

  if (carregandoUsuario) {
    return (
      <>
        <Header title="Relatório - Saldo Diário" />
        <div className="page-content flex h-80 items-center justify-center">
          <Loading text="Carregando informações do relatório..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Relatório - Saldo Diário"
        subtitle={`Data selecionada: ${formatarDataPt(dataReferencia)}`}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="date"
              value={dataReferencia}
              onChange={(event) => setDataReferencia(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
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
          <div ref={reportRef} className="report-wrapper">
            <div className="report-header">
              <div>
                <p className="report-header__title">
                  Saldo Diário - {nomeEmpresa}
                </p>
                <p className="report-header__subtitle">Data de referência: {formatarDataPt(relatorio.data)}</p>
              </div>
              <div className="report-header__meta">
                <span>Emitido em</span>
                <strong>{dataEmissao}</strong>
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
              })}
              {renderTabelaComparativa('Saldos Bancários', relatorio.bancos, {
                accent: 'cinza',
                totalLabel: 'Total em Bancos',
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
    </>
  );
};

export default RelatorioSaldoDiarioPage;
