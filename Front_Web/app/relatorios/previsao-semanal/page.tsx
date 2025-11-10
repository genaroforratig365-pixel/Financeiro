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

const formatarData = (iso: string): string => {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

const formatarIntervaloSemana = (inicio: string, fim: string): string => {
  if (!inicio) {
    return '';
  }
  const inicioFmt = formatarData(inicio);
  const fimFmt = fim ? formatarData(fim) : '';
  return fimFmt ? `${inicioFmt} a ${fimFmt}` : inicioFmt;
};

type SemanaOption = {
  id: number;
  inicio: string;
  fim: string;
  status: string | null;
};

type PrevisaoItem = {
  id: number;
  data: string;
  tipo: string;
  categoria: string;
  valor: number;
  ordem: number;
};

type ReportRow = {
  categoria: string;
  valores: Record<string, number>;
  total: number;
};

type RelatorioDados = {
  datas: string[];
  datasFormatadas: string[];
  receitas: ReportRow[];
  despesas: ReportRow[];
  totalReceitasPorData: Record<string, number>;
  totalDespesasPorData: Record<string, number>;
  totalReceitasGeral: number;
  totalDespesasGeral: number;
  saldoInicial: ReportRow | null;
  saldoDiario: ReportRow | null;
  saldoAcumulado: ReportRow | null;
};

const agruparPorCategoria = (itens: PrevisaoItem[], datas: string[]): ReportRow[] => {
  const mapa = new Map<string, { ordem: number; valores: Record<string, number> }>();

  itens.forEach((item) => {
    const chave = item.categoria || 'Sem categoria';
    const existente = mapa.get(chave);
    if (existente) {
      existente.ordem = Math.min(existente.ordem, item.ordem ?? existente.ordem);
      existente.valores[item.data] = (existente.valores[item.data] ?? 0) + item.valor;
    } else {
      mapa.set(chave, {
        ordem: item.ordem ?? 0,
        valores: { [item.data]: item.valor },
      });
    }
  });

  return Array.from(mapa.entries())
    .sort((a, b) => {
      const ordemDiff = a[1].ordem - b[1].ordem;
      if (ordemDiff !== 0) return ordemDiff;
      return a[0].localeCompare(b[0], 'pt-BR');
    })
    .map(([categoria, info]) => {
      const valores = datas.reduce<Record<string, number>>((acc, data) => {
        const valor = info.valores[data] ?? 0;
        acc[data] = Math.round(valor * 100) / 100;
        return acc;
      }, {});
      const total = Object.values(valores).reduce((sum, valor) => sum + valor, 0);
      return { categoria, valores, total };
    })
    .filter((row) => row.total !== 0 || datas.some((data) => row.valores[data] !== 0));
};

const construirLinha = (
  itens: PrevisaoItem[],
  datas: string[],
  nomePadrao: string,
): ReportRow | null => {
  if (itens.length === 0) {
    return null;
  }
  const valores = datas.reduce<Record<string, number>>((acc, data) => {
    const totalData = itens
      .filter((item) => item.data === data)
      .reduce((sum, item) => sum + item.valor, 0);
    acc[data] = Math.round(totalData * 100) / 100;
    return acc;
  }, {});
  const total = Object.values(valores).reduce((sum, valor) => sum + valor, 0);
  if (total === 0) {
    return null;
  }
  return {
    categoria: itens[0]?.categoria || nomePadrao,
    valores,
    total,
  };
};

const RelatorioPrevisaoSemanalPage: React.FC = () => {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [semanas, setSemanas] = useState<SemanaOption[]>([]);
  const [semanaSelecionada, setSemanaSelecionada] = useState<string | null>(null);
  const [carregandoUsuario, setCarregandoUsuario] = useState(true);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDados | null>(null);

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
      console.error('Erro ao carregar usuário para o relatório:', error);
      setErro(
        traduzirErroSupabase(
          error,
          'Não foi possível carregar as informações do usuário. Tente novamente mais tarde.',
        ),
      );
    } finally {
      setCarregandoUsuario(false);
    }
  }, []);

  useEffect(() => {
    carregarUsuario();
  }, [carregarUsuario]);

  const carregarSemanas = useCallback(
    async (usuarioAtual: UsuarioRow) => {
      try {
        const supabase = getSupabaseClient();
        // Todos os usuários podem visualizar todas as semanas
        const { data, error } = await supabase
          .from('pvs_semanas')
          .select('pvs_id, pvs_semana_inicio, pvs_semana_fim, pvs_status')
          .order('pvs_semana_inicio', { ascending: false });

        if (error) throw error;

        const opcoes = (data ?? []).map((semana) => ({
          id: Number(semana.pvs_id),
          inicio: String(semana.pvs_semana_inicio ?? ''),
          fim: String(semana.pvs_semana_fim ?? ''),
          status: semana.pvs_status ?? null,
        }));

        setSemanas(opcoes);
        if (!semanaSelecionada && opcoes.length > 0) {
          setSemanaSelecionada(opcoes[0].inicio);
        }
        if (opcoes.length === 0) {
          setAviso('Nenhuma previsão semanal foi importada até o momento.');
        } else {
          setAviso(null);
        }
      } catch (error) {
        console.error('Erro ao carregar semanas disponíveis:', error);
        setErro(
          traduzirErroSupabase(
            error,
            'Não foi possível carregar as semanas importadas. Atualize a página e tente novamente.',
          ),
        );
      }
    },
    [semanaSelecionada],
  );

  useEffect(() => {
    if (!usuario) {
      return;
    }
    carregarSemanas(usuario);
  }, [usuario, carregarSemanas]);

  const carregarRelatorio = useCallback(
    async (usuarioAtual: UsuarioRow, semana: SemanaOption) => {
      try {
        setCarregandoDados(true);
        setErro(null);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('pvi_previsao_itens')
          .select('pvi_id, pvi_data, pvi_tipo, pvi_categoria, pvi_valor, pvi_ordem, pvi_pvs_id')
          .eq('pvi_pvs_id', semana.id)
          .order('pvi_ordem', { ascending: true })
          .order('pvi_data', { ascending: true });

        if (error) throw error;

        const itens: PrevisaoItem[] = (data ?? []).map((item) => ({
          id: Number(item.pvi_id),
          data: String(item.pvi_data ?? ''),
          tipo: String(item.pvi_tipo ?? ''),
          categoria: String(item.pvi_categoria ?? ''),
          valor: Math.round(Number(item.pvi_valor ?? 0) * 100) / 100,
          ordem: item.pvi_ordem !== null ? Number(item.pvi_ordem) : 0,
        }));

        if (itens.length === 0) {
          setRelatorio(null);
          setAviso('Não existem lançamentos importados para a semana selecionada.');
          return;
        }

        const datasOrdenadas = Array.from(new Set(itens.map((item) => item.data)))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));

        const receitasItens = itens.filter((item) => item.tipo === 'receita');
        const despesasItens = itens.filter((item) => item.tipo === 'gasto');
        const saldoInicialItens = itens.filter((item) => item.tipo === 'saldo_inicial');
        const saldoDiarioItens = itens.filter((item) => item.tipo === 'saldo_diario');

        const receitas = agruparPorCategoria(receitasItens, datasOrdenadas);
        const despesas = agruparPorCategoria(despesasItens, datasOrdenadas);
        const saldoInicial = construirLinha(saldoInicialItens, datasOrdenadas, 'Saldo inicial');
        const saldoDiario = construirLinha(saldoDiarioItens, datasOrdenadas, 'Saldo diário previsto');

        // Calcula saldo acumulado corretamente:
        // Primeiro dia: saldo inicial + saldo diário calculado
        // Demais dias: saldo acumulado anterior + saldo diário calculado
        let saldoAcumulado: ReportRow | null = null;
        if (saldoInicial && saldoDiario) {
          const valores: Record<string, number> = {};
          let saldoAnterior = 0;

          datasOrdenadas.forEach((data, index) => {
            const saldoDiarioCalculado = saldoDiario.valores[data] ?? 0;

            if (index === 0) {
              // Primeiro dia: saldo inicial + saldo diário calculado
              const saldoInicialDia = saldoInicial.valores[data] ?? 0;
              valores[data] = Math.round((saldoInicialDia + saldoDiarioCalculado) * 100) / 100;
            } else {
              // Demais dias: saldo acumulado anterior + saldo diário calculado
              valores[data] = Math.round((saldoAnterior + saldoDiarioCalculado) * 100) / 100;
            }
            saldoAnterior = valores[data];
          });

          // Total: saldo inicial do primeiro registro + soma de todos os saldos diários
          const primeiraData = datasOrdenadas[0];
          const saldoInicialPrimeiro = primeiraData ? (saldoInicial.valores[primeiraData] ?? 0) : 0;
          const somaSaldosDiarios = datasOrdenadas.reduce((sum, data) =>
            sum + (saldoDiario.valores[data] ?? 0), 0
          );
          const total = Math.round((saldoInicialPrimeiro + somaSaldosDiarios) * 100) / 100;

          saldoAcumulado = {
            categoria: 'Saldo acumulado previsto',
            valores,
            total,
          };
        }

        const totalReceitasPorData = datasOrdenadas.reduce<Record<string, number>>((acc, data) => {
          acc[data] = receitas.reduce((sum, row) => sum + (row.valores[data] ?? 0), 0);
          return acc;
        }, {});

        const totalDespesasPorData = datasOrdenadas.reduce<Record<string, number>>((acc, data) => {
          acc[data] = despesas.reduce((sum, row) => sum + (row.valores[data] ?? 0), 0);
          return acc;
        }, {});

        const totalReceitasGeral = receitas.reduce((sum, row) => sum + row.total, 0);
        const totalDespesasGeral = despesas.reduce((sum, row) => sum + row.total, 0);

        setRelatorio({
          datas: datasOrdenadas,
          datasFormatadas: datasOrdenadas.map(formatarData),
          receitas,
          despesas,
          totalReceitasPorData,
          totalDespesasPorData,
          totalReceitasGeral,
          totalDespesasGeral,
          saldoInicial,
          saldoDiario,
          saldoAcumulado,
        });
        setAviso(null);
      } catch (error) {
        console.error('Erro ao carregar itens da previsão semanal:', error);
        setErro(
          traduzirErroSupabase(
            error,
            'Não foi possível carregar os itens da previsão para a semana selecionada.',
          ),
        );
        setRelatorio(null);
      } finally {
        setCarregandoDados(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!usuario) return;
    if (!semanaSelecionada) {
      setRelatorio(null);
      return;
    }
    const semana = semanas.find((item) => item.inicio === semanaSelecionada);
    if (!semana) {
      setRelatorio(null);
      return;
    }
    carregarRelatorio(usuario, semana);
  }, [usuario, semanas, semanaSelecionada, carregarRelatorio]);

  const semanaAtual = useMemo(() => semanas.find((item) => item.inicio === semanaSelecionada) ?? null, [semanas, semanaSelecionada]);

  const totalReceitas = relatorio?.totalReceitasGeral ?? 0;
  const totalDespesas = relatorio?.totalDespesasGeral ?? 0;
  const resultadoSemana = totalReceitas - totalDespesas;
  const saldoInicialTotal = relatorio?.saldoInicial?.total ?? 0;
  const saldoFinalPrevisto = useMemo(() => {
    if (!relatorio) return saldoInicialTotal + resultadoSemana;
    if (relatorio.saldoAcumulado) {
      const ultimaData = relatorio.datas[relatorio.datas.length - 1];
      if (ultimaData) {
        const valor = relatorio.saldoAcumulado.valores[ultimaData];
        if (typeof valor === 'number') {
          return valor;
        }
      }
    }
    return saldoInicialTotal + resultadoSemana;
  }, [relatorio, saldoInicialTotal, resultadoSemana]);

  const handleExportPdf = () => {
    if (!reportRef.current) {
      return;
    }

    const html = reportRef.current.innerHTML;
    const titulo = 'Previsão de Pagamentos';
    const janela = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!janela) {
      return;
    }

    const estilos = `
      * { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; box-sizing: border-box; }
      body { margin: 24px; background-color: #f8fafc; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      h2 { font-size: 14px; color: #6b7280; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; background-color: #ffffff; }
      th, td { border: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; }
      th { background-color: #f3f4f6; text-align: right; font-weight: 600; }
      th:first-child, td:first-child { text-align: left; }
      .text-right { text-align: right; }
      .text-left { text-align: left; }
      .font-semibold { font-weight: 600; }
      .uppercase { text-transform: uppercase; }
      .tracking-wide { letter-spacing: 0.05em; }
      .bg-white { background-color: #ffffff; }
      .bg-gray-50 { background-color: #f9fafb; }
      .bg-gray-100 { background-color: #f3f4f6; }
      .bg-primary-50 { background-color: #eef2ff; }
      .bg-primary-50\/70 { background-color: rgba(238, 242, 255, 0.7); }
      .bg-error-50 { background-color: #fee2e2; }
      .bg-error-50\/70 { background-color: rgba(254, 226, 226, 0.7); }
      .text-gray-700 { color: #374151; }
      .text-gray-900 { color: #111827; }
      .text-primary-800 { color: #3730a3; }
      .text-primary-900 { color: #312e81; }
      .text-error-800 { color: #9b1c1c; }
      .text-error-900 { color: #7f1d1d; }
      .px-4 { padding-left: 16px; padding-right: 16px; }
      .py-3 { padding-top: 12px; padding-bottom: 12px; }
      .rounded-lg { border-radius: 12px; }
      .border { border: 1px solid #e5e7eb; }
      .border-gray-200 { border-color: #e5e7eb; }
      .divide-y > * + * { border-top: 1px solid #e5e7eb; }
      .divide-gray-100 > * + * { border-color: #f5f5f5; }
      .divide-gray-200 > * + * { border-color: #e5e7eb; }
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

  if (carregandoUsuario) {
    return (
      <>
        <Header title="Relatório - Previsão Semanal" />
        <div className="page-content flex h-80 items-center justify-center">
          <Loading text="Carregando informações do relatório..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Relatório - Previsão Semanal"
        subtitle={
          semanaAtual
            ? `Semana de ${formatarIntervaloSemana(semanaAtual.inicio, semanaAtual.fim)}`
            : 'Selecione uma semana importada para visualizar o relatório'
        }
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={semanaSelecionada ?? ''}
              onChange={(event) => setSemanaSelecionada(event.target.value || null)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={semanas.length === 0}
            >
              {semanas.length === 0 ? (
                <option value="">Nenhuma semana importada</option>
              ) : (
                semanas.map((semana) => (
                  <option key={semana.id} value={semana.inicio}>
                    {formatarIntervaloSemana(semana.inicio, semana.fim)}
                    {semana.status ? ` • ${semana.status}` : ''}
                  </option>
                ))
              )}
            </select>
            <Button
              variant="primary"
              onClick={handleExportPdf}
              disabled={!relatorio || carregandoDados}
            >
              Exportar PDF
            </Button>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <div className="rounded-md border border-error-200 bg-error-50 px-4 py-3 text-error-700">{erro}</div>
        )}

        {aviso && !erro && (
          <div className="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-warning-800">{aviso}</div>
        )}

        {carregandoDados && (
          <div className="flex h-40 items-center justify-center">
            <Loading text="Carregando dados da previsão..." />
          </div>
        )}

        {relatorio && !carregandoDados && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-primary-200 bg-primary-50/60 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Total de Receitas</p>
                <p className="mt-2 text-2xl font-semibold text-primary-900">{formatCurrency(totalReceitas)}</p>
              </div>
              <div className="rounded-lg border border-error-200 bg-error-50/70 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-error-700">Total de Despesas</p>
                <p className="mt-2 text-2xl font-semibold text-error-800">{formatCurrency(totalDespesas)}</p>
              </div>
              <div className="rounded-lg border border-success-200 bg-success-50/70 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-success-700">Resultado da Semana</p>
                <p className={`mt-2 text-2xl font-semibold ${resultadoSemana >= 0 ? 'text-success-800' : 'text-error-700'}`}>
                  {formatCurrency(resultadoSemana)}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Saldo Final Previsto</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(saldoFinalPrevisto)}</p>
              </div>
            </div>

            <div ref={reportRef}>
              <Card
                title="Previsão de Pagamentos (Fluxo de Caixa)"
                subtitle={
                  semanaAtual
                    ? `Período: ${formatarIntervaloSemana(semanaAtual.inicio, semanaAtual.fim)}${semanaAtual.status ? ` • Status: ${semanaAtual.status}` : ''}`
                    : undefined
                }
                variant="default"
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Categoria</th>
                        {relatorio.datasFormatadas.map((data) => (
                          <th key={data} className="px-4 py-3 text-right font-semibold">
                            {data}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      <tr className="bg-primary-50 text-primary-800">
                        <td colSpan={relatorio.datas.length + 2} className="px-4 py-3 font-semibold">Receitas</td>
                      </tr>
                      {relatorio.receitas.map((row) => (
                        <tr key={`receita-${row.categoria}`}>
                          <td className="px-4 py-3 text-gray-700">{row.categoria}</td>
                          {relatorio.datas.map((data) => (
                            <td key={data} className="px-4 py-3 text-right text-gray-700">
                              {formatCurrency(row.valores[data] ?? 0)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">
                            {formatCurrency(row.total)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-primary-50/70 font-semibold text-primary-900">
                        <td className="px-4 py-3">Total de Receitas</td>
                        {relatorio.datas.map((data) => (
                          <td key={data} className="px-4 py-3 text-right">
                            {formatCurrency(relatorio.totalReceitasPorData[data] ?? 0)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">{formatCurrency(totalReceitas)}</td>
                      </tr>

                      <tr className="bg-error-50 text-error-800">
                        <td colSpan={relatorio.datas.length + 2} className="px-4 py-3 font-semibold">Despesas</td>
                      </tr>
                      {relatorio.despesas.map((row) => (
                        <tr key={`despesa-${row.categoria}`}>
                          <td className="px-4 py-3 text-gray-700">{row.categoria}</td>
                          {relatorio.datas.map((data) => (
                            <td key={data} className="px-4 py-3 text-right text-gray-700">
                              {formatCurrency(row.valores[data] ?? 0)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">
                            {formatCurrency(row.total)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-error-50/70 font-semibold text-error-900">
                        <td className="px-4 py-3">Total de Despesas</td>
                        {relatorio.datas.map((data) => (
                          <td key={data} className="px-4 py-3 text-right">
                            {formatCurrency(relatorio.totalDespesasPorData[data] ?? 0)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">{formatCurrency(totalDespesas)}</td>
                      </tr>

                      {relatorio.saldoInicial && (
                        <tr className="bg-gray-50 font-semibold text-gray-800">
                          <td className="px-4 py-3">{relatorio.saldoInicial.categoria}</td>
                          {relatorio.datas.map((data) => (
                            <td key={data} className="px-4 py-3 text-right">
                              {formatCurrency(relatorio.saldoInicial?.valores[data] ?? 0)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right">{formatCurrency(relatorio.saldoInicial.total)}</td>
                        </tr>
                      )}

                      {relatorio.saldoDiario && (
                        <tr className="bg-gray-50 font-semibold text-gray-800">
                          <td className="px-4 py-3">{relatorio.saldoDiario.categoria}</td>
                          {relatorio.datas.map((data) => (
                            <td key={data} className="px-4 py-3 text-right">
                              {formatCurrency(relatorio.saldoDiario?.valores[data] ?? 0)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right">{formatCurrency(relatorio.saldoDiario.total)}</td>
                        </tr>
                      )}

                      {relatorio.saldoAcumulado && (
                        <tr className="bg-gray-100 font-semibold text-gray-900">
                          <td className="px-4 py-3">{relatorio.saldoAcumulado.categoria}</td>
                          {relatorio.datas.map((data) => (
                            <td key={data} className="px-4 py-3 text-right">
                              {formatCurrency(relatorio.saldoAcumulado?.valores[data] ?? 0)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right">{formatCurrency(relatorio.saldoAcumulado.total)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default RelatorioPrevisaoSemanalPage;
