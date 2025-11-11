'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { formatCurrency } from '@/lib/mathParser';

interface PrevisaoItem {
  data: string;
  tipo: 'receita' | 'gasto';
  categoria: string;
  valor: number;
}

interface SaldoRealizado {
  data: string;
  receitas: number;
  despesas: number;
  saldo: number;
}

interface ComparativoData {
  data: string;
  previsto_receitas: number;
  realizado_receitas: number;
  variacao_receitas: number;
  previsto_despesas: number;
  realizado_despesas: number;
  variacao_despesas: number;
  saldo_previsto: number;
  saldo_realizado: number;
  variacao_saldo: number;
}

export default function PrevistoRealizadoPage() {
  const [carregando, setCarregando] = useState(true);
  const [previsoes, setPrevisoes] = useState<PrevisaoItem[]>([]);
  const [saldos, setSaldos] = useState<SaldoRealizado[]>([]);
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');

  useEffect(() => {
    // Define período padrão: semana atual
    const hoje = new Date();
    const inicioDaSemana = new Date(hoje);
    inicioDaSemana.setDate(hoje.getDate() - hoje.getDay() + 1); // Segunda-feira
    const fimDaSemana = new Date(inicioDaSemana);
    fimDaSemana.setDate(inicioDaSemana.getDate() + 6); // Domingo

    const formatarData = (d: Date) => d.toISOString().split('T')[0];
    setPeriodoInicio(formatarData(inicioDaSemana));
    setPeriodoFim(formatarData(fimDaSemana));
  }, []);

  useEffect(() => {
    if (!periodoInicio || !periodoFim) return;

    const carregarDados = async () => {
      setCarregando(true);
      try {
        const supabase = getSupabaseClient();

        // Buscar previsões do período
        const { data: previsoesData, error: erroPrevisoes } = await supabase
          .from('fpre_itens')
          .select('data, tipo, categoria, valor')
          .gte('data', periodoInicio)
          .lte('data', periodoFim)
          .order('data');

        if (erroPrevisoes) throw erroPrevisoes;

        // Buscar saldos realizados
        const { data: saldosData, error: erroSaldos } = await supabase
          .rpc('obter_saldo_diario_periodo', {
            p_data_inicio: periodoInicio,
            p_data_fim: periodoFim
          });

        if (erroSaldos) throw erroSaldos;

        setPrevisoes(previsoesData || []);
        setSaldos(saldosData || []);
      } catch (erro) {
        console.error('Erro ao carregar dados:', erro);
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [periodoInicio, periodoFim]);

  const dadosComparativos = useMemo((): ComparativoData[] => {
    const todasDatas = new Set<string>();
    previsoes.forEach(p => todasDatas.add(p.data));
    saldos.forEach(s => todasDatas.add(s.data));

    const datasOrdenadas = Array.from(todasDatas).sort();

    return datasOrdenadas.map(data => {
      const previsoesData = previsoes.filter(p => p.data === data);
      const saldoData = saldos.find(s => s.data === data);

      const previsto_receitas = previsoesData
        .filter(p => p.tipo === 'receita')
        .reduce((sum, p) => sum + p.valor, 0);

      const previsto_despesas = previsoesData
        .filter(p => p.tipo === 'gasto')
        .reduce((sum, p) => sum + p.valor, 0);

      const realizado_receitas = saldoData?.receitas || 0;
      const realizado_despesas = saldoData?.despesas || 0;

      const saldo_previsto = previsto_receitas - previsto_despesas;
      const saldo_realizado = realizado_receitas - realizado_despesas;

      const calcVariacao = (real: number, prev: number) => {
        if (prev === 0) return real !== 0 ? 100 : 0;
        return ((real - prev) / Math.abs(prev)) * 100;
      };

      return {
        data,
        previsto_receitas,
        realizado_receitas,
        variacao_receitas: calcVariacao(realizado_receitas, previsto_receitas),
        previsto_despesas,
        realizado_despesas,
        variacao_despesas: calcVariacao(realizado_despesas, previsto_despesas),
        saldo_previsto,
        saldo_realizado,
        variacao_saldo: calcVariacao(saldo_realizado, saldo_previsto)
      };
    });
  }, [previsoes, saldos]);

  const totais = useMemo(() => {
    return dadosComparativos.reduce(
      (acc, d) => ({
        previsto_receitas: acc.previsto_receitas + d.previsto_receitas,
        realizado_receitas: acc.realizado_receitas + d.realizado_receitas,
        previsto_despesas: acc.previsto_despesas + d.previsto_despesas,
        realizado_despesas: acc.realizado_despesas + d.realizado_despesas,
        saldo_previsto: acc.saldo_previsto + d.saldo_previsto,
        saldo_realizado: acc.saldo_realizado + d.saldo_realizado
      }),
      {
        previsto_receitas: 0,
        realizado_receitas: 0,
        previsto_despesas: 0,
        realizado_despesas: 0,
        saldo_previsto: 0,
        saldo_realizado: 0
      }
    );
  }, [dadosComparativos]);

  const formatarData = (data: string) => {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}`;
  };

  const renderVariacao = (variacao: number) => {
    const cor = variacao >= 0 ? 'text-success-700' : 'text-error-700';
    const sinal = variacao >= 0 ? '+' : '';
    return (
      <span className={`text-sm font-semibold ${cor}`}>
        {sinal}{variacao.toFixed(1)}%
      </span>
    );
  };

  return (
    <>
      <Header
        title="Previsto x Realizado"
        subtitle="Compare metas planejadas com os resultados alcançados"
      />

      <div className="page-content space-y-6">
        {/* Filtros de período */}
        <Card title="Período de Análise">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Data Início
              </label>
              <input
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Data Fim
              </label>
              <input
                type="date"
                value={periodoFim}
                onChange={(e) => setPeriodoFim(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </Card>

        {carregando ? (
          <Card>
            <div className="py-6">
              <Loading text="Carregando dados..." />
            </div>
          </Card>
        ) : (
          <>
            {/* KPIs Gerais */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Card title="Receitas" variant="success">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Previsto</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(totais.previsto_receitas)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Realizado</p>
                    <p className="text-2xl font-bold text-success-700">
                      {formatCurrency(totais.realizado_receitas)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Variação</p>
                    {renderVariacao(
                      totais.previsto_receitas === 0
                        ? 0
                        : ((totais.realizado_receitas - totais.previsto_receitas) /
                            Math.abs(totais.previsto_receitas)) *
                          100
                    )}
                  </div>
                </div>
              </Card>

              <Card title="Despesas" variant="danger">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Previsto</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(totais.previsto_despesas)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Realizado</p>
                    <p className="text-2xl font-bold text-error-700">
                      {formatCurrency(totais.realizado_despesas)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Variação</p>
                    {renderVariacao(
                      totais.previsto_despesas === 0
                        ? 0
                        : ((totais.realizado_despesas - totais.previsto_despesas) /
                            Math.abs(totais.previsto_despesas)) *
                          100
                    )}
                  </div>
                </div>
              </Card>

              <Card title="Saldo" variant="primary">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Previsto</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(totais.saldo_previsto)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Realizado</p>
                    <p
                      className={`text-2xl font-bold ${
                        totais.saldo_realizado >= 0 ? 'text-success-700' : 'text-error-700'
                      }`}
                    >
                      {formatCurrency(totais.saldo_realizado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Variação</p>
                    {renderVariacao(
                      totais.saldo_previsto === 0
                        ? 0
                        : ((totais.saldo_realizado - totais.saldo_previsto) /
                            Math.abs(totais.saldo_previsto)) *
                          100
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Tabela Comparativa */}
            <Card title="Comparativo Diário">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Data</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">
                        Prev. Receitas
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">
                        Real. Receitas
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Var.</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">
                        Prev. Despesas
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">
                        Real. Despesas
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Var.</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">
                        Saldo Prev.
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">
                        Saldo Real.
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Var.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {dadosComparativos.map((item) => (
                      <tr key={item.data} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900 font-medium">
                          {formatarData(item.data)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {formatCurrency(item.previsto_receitas)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-success-700">
                          {formatCurrency(item.realizado_receitas)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {renderVariacao(item.variacao_receitas)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {formatCurrency(item.previsto_despesas)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-error-700">
                          {formatCurrency(item.realizado_despesas)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {renderVariacao(item.variacao_despesas)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {formatCurrency(item.saldo_previsto)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            item.saldo_realizado >= 0 ? 'text-success-700' : 'text-error-700'
                          }`}
                        >
                          {formatCurrency(item.saldo_realizado)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {renderVariacao(item.variacao_saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
