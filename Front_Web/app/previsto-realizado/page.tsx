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
  areaId: number | null;
  area_nome: string | null;
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

interface AreaOption {
  id: number;
  nome: string;
}

interface DadosGrafico {
  data: string;
  previsto: number;
  realizado: number;
}

// Componente de Barras Verticais
const BarrasVerticaisChart: React.FC<{
  dados: DadosGrafico[];
  corPrevisto: string;
  corRealizado: string;
  labelPrevisto?: string;
  labelRealizado?: string;
}> = ({ dados, corPrevisto, corRealizado, labelPrevisto = 'Previsto', labelRealizado = 'Realizado' }) => {
  const width = 600;
  const height = 300;
  const paddingX = 60;
  const paddingY = 40;
  const barWidth = dados.length > 0 ? Math.min(40, (width - paddingX * 2) / (dados.length * 2.5)) : 40;
  const gap = barWidth * 0.3;

  const valores = dados.flatMap(d => [d.previsto, d.realizado]);
  const maxValor = valores.length ? Math.max(...valores, 0) : 0;
  const maxArredondado = Math.ceil(maxValor / 50000) * 50000 || 100000;
  const escalaY = maxArredondado > 0 ? (height - paddingY * 2) / maxArredondado : 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: corPrevisto }}></div>
          <span>{labelPrevisto}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: corRealizado }}></div>
          <span>{labelRealizado}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* Eixos */}
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#d1d5db" strokeWidth={2} />
        <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} stroke="#d1d5db" strokeWidth={2} />

        {/* Linhas de grade Y */}
        {Array.from({ length: 5 }, (_, i) => i).map((step) => {
          const valor = (maxArredondado / 4) * step;
          const y = height - paddingY - (valor * escalaY);
          return (
            <g key={step}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#f1f5f9" strokeWidth={1} strokeDasharray="4 4" />
              <text x={paddingX - 8} y={y + 4} textAnchor="end" className="text-[11px] fill-gray-600">
                {formatCurrency(valor)}
              </text>
            </g>
          );
        })}

        {/* Barras */}
        {dados.map((item, idx) => {
          const x = paddingX + (idx * (barWidth * 2 + gap * 3)) + gap;
          const alturaP = item.previsto * escalaY;
          const alturaR = item.realizado * escalaY;

          return (
            <g key={idx}>
              {/* Barra Previsto */}
              <rect
                x={x}
                y={height - paddingY - alturaP}
                width={barWidth}
                height={alturaP}
                fill={corPrevisto}
                rx={2}
              />
              {/* Barra Realizado */}
              <rect
                x={x + barWidth + gap}
                y={height - paddingY - alturaR}
                width={barWidth}
                height={alturaR}
                fill={corRealizado}
                rx={2}
              />
              {/* Label data */}
              <text
                x={x + barWidth + gap / 2}
                y={height - paddingY + 20}
                textAnchor="middle"
                className="text-[11px] fill-gray-600"
              >
                {item.data}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// Componente de Linhas
const LinhasChart: React.FC<{
  dados: DadosGrafico[];
  corPrevisto: string;
  corRealizado: string;
  labelPrevisto?: string;
  labelRealizado?: string;
}> = ({ dados, corPrevisto, corRealizado, labelPrevisto = 'Previsto', labelRealizado = 'Realizado' }) => {
  const width = 600;
  const height = 300;
  const paddingX = 60;
  const paddingY = 40;
  const passoX = dados.length > 1 ? (width - paddingX * 2) / (dados.length - 1) : 0;

  const valores = dados.flatMap(d => [d.previsto, d.realizado]);
  const maxValor = valores.length ? Math.max(...valores, 0) : 0;
  const maxArredondado = Math.ceil(maxValor / 50000) * 50000 || 100000;
  const escalaY = maxArredondado > 0 ? (height - paddingY * 2) / maxArredondado : 0;

  const pontosPrevisto = dados.map((item, idx) => {
    const x = paddingX + passoX * idx;
    const y = height - paddingY - item.previsto * escalaY;
    return `${x},${y}`;
  }).join(' ');

  const pontosRealizado = dados.map((item, idx) => {
    const x = paddingX + passoX * idx;
    const y = height - paddingY - item.realizado * escalaY;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: corPrevisto }}></div>
          <span>{labelPrevisto}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: corRealizado }}></div>
          <span>{labelRealizado}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* Eixos */}
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#d1d5db" strokeWidth={2} />
        <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} stroke="#d1d5db" strokeWidth={2} />

        {/* Linhas de grade Y */}
        {Array.from({ length: 5 }, (_, i) => i).map((step) => {
          const valor = (maxArredondado / 4) * step;
          const y = height - paddingY - (valor * escalaY);
          return (
            <g key={step}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#f1f5f9" strokeWidth={1} strokeDasharray="4 4" />
              <text x={paddingX - 8} y={y + 4} textAnchor="end" className="text-[11px] fill-gray-600">
                {formatCurrency(valor)}
              </text>
            </g>
          );
        })}

        {/* Linhas */}
        <polyline points={pontosPrevisto} fill="none" stroke={corPrevisto} strokeWidth={3} strokeLinejoin="round" />
        <polyline points={pontosRealizado} fill="none" stroke={corRealizado} strokeWidth={3} strokeLinejoin="round" />

        {/* Pontos */}
        {dados.map((item, idx) => {
          const x = paddingX + passoX * idx;
          const yP = height - paddingY - item.previsto * escalaY;
          const yR = height - paddingY - item.realizado * escalaY;

          return (
            <g key={idx}>
              <circle cx={x} cy={yP} r={4} fill={corPrevisto} stroke="#fff" strokeWidth={2} />
              <circle cx={x} cy={yR} r={4} fill={corRealizado} stroke="#fff" strokeWidth={2} />
              <text x={x} y={height - paddingY + 20} textAnchor="middle" className="text-[11px] fill-gray-600">
                {item.data}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default function PrevistoRealizadoPage() {
  const [carregando, setCarregando] = useState(true);
  const [previsoes, setPrevisoes] = useState<PrevisaoItem[]>([]);
  const [saldos, setSaldos] = useState<SaldoRealizado[]>([]);
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [areaFiltro, setAreaFiltro] = useState<number | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'receita' | 'gasto'>('todos');
  const [tipoGrafico, setTipoGrafico] = useState<'linhas' | 'barras'>('barras');

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
    const carregarAreas = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('are_areas')
          .select('are_id, are_nome')
          .eq('are_ativo', true)
          .order('are_nome');

        if (error) throw error;

        setAreas((data || []).map((a: any) => ({
          id: a.are_id,
          nome: a.are_nome
        })));
      } catch (erro) {
        console.error('Erro ao carregar áreas:', erro);
      }
    };

    carregarAreas();
  }, []);

  useEffect(() => {
    if (!periodoInicio || !periodoFim) return;

    const carregarDados = async () => {
      setCarregando(true);
      try {
        const supabase = getSupabaseClient();

        // Buscar previsões do período (da tabela pvi_previsao_itens)
        // Primeiro, vamos verificar se existe ALGUM dado na tabela
        const { data: previsoesData, error: erroPrevisoes } = await supabase
          .from('pvi_previsao_itens')
          .select(`
            pvi_data,
            pvi_tipo,
            pvi_categoria,
            pvi_valor,
            pvi_are_id,
            are_areas!pvi_are_id (are_nome)
          `)
          .gte('pvi_data', periodoInicio)
          .lte('pvi_data', periodoFim)
          .in('pvi_tipo', ['receita', 'gasto'])
          .order('pvi_data');

        if (erroPrevisoes) throw erroPrevisoes;

        // Transformar dados
        const previsoesFormatadas = (previsoesData || []).map((item: any) => {
          const area = Array.isArray(item.are_areas) ? item.are_areas[0] : item.are_areas;
          return {
            data: item.pvi_data,
            tipo: item.pvi_tipo,
            categoria: item.pvi_categoria,
            valor: Number(item.pvi_valor) || 0,
            areaId: item.pvi_are_id,
            area_nome: area?.are_nome || null
          };
        });

        // Buscar saldos realizados - calculando diretamente das tabelas
        // Buscar receitas de rec_receitas
        const { data: receitasData, error: erroReceitas } = await supabase
          .from('rec_receitas')
          .select('rec_data, rec_valor')
          .gte('rec_data', periodoInicio)
          .lte('rec_data', periodoFim);

        if (erroReceitas) throw erroReceitas;

        // Buscar cobranças (TAMBÉM SÃO RECEITAS - lançamento de cobrança)
        const { data: cobrancasData, error: erroCobrancas } = await supabase
          .from('cob_cobrancas')
          .select('cob_data, cob_valor')
          .gte('cob_data', periodoInicio)
          .lte('cob_data', periodoFim);

        if (erroCobrancas) throw erroCobrancas;

        // Buscar DESPESAS de pag_pagamentos_area
        const { data: pagamentosData, error: erroPagamentos } = await supabase
          .from('pag_pagamentos_area')
          .select('pag_data, pag_valor')
          .gte('pag_data', periodoInicio)
          .lte('pag_data', periodoFim);

        if (erroPagamentos) throw erroPagamentos;

        // Agrupar por data
        const saldosPorData = new Map<string, { receitas: number; despesas: number }>();

        // rec_receitas → RECEITAS
        (receitasData || []).forEach((rec: any) => {
          const data = rec.rec_data;
          if (!saldosPorData.has(data)) {
            saldosPorData.set(data, { receitas: 0, despesas: 0 });
          }
          saldosPorData.get(data)!.receitas += Number(rec.rec_valor) || 0;
        });

        // cob_cobrancas → RECEITAS (lançamento de cobrança)
        (cobrancasData || []).forEach((cob: any) => {
          const data = cob.cob_data;
          if (!saldosPorData.has(data)) {
            saldosPorData.set(data, { receitas: 0, despesas: 0 });
          }
          saldosPorData.get(data)!.receitas += Number(cob.cob_valor) || 0;
        });

        // pag_pagamentos_area → DESPESAS
        (pagamentosData || []).forEach((pag: any) => {
          const data = pag.pag_data;
          if (!saldosPorData.has(data)) {
            saldosPorData.set(data, { receitas: 0, despesas: 0 });
          }
          saldosPorData.get(data)!.despesas += Number(pag.pag_valor) || 0;
        });

        // Converter para array no formato esperado
        const saldosCalculados: SaldoRealizado[] = Array.from(saldosPorData.entries()).map(
          ([data, valores]) => ({
            data,
            receitas: valores.receitas,
            despesas: valores.despesas,
            saldo: valores.receitas - valores.despesas
          })
        );

        setPrevisoes(previsoesFormatadas);
        setSaldos(saldosCalculados);
      } catch (erro) {
        console.error('Erro ao carregar dados:', erro);
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [periodoInicio, periodoFim]);

  const previsoesFiltradas = useMemo(() => {
    let resultado = previsoes;

    if (areaFiltro !== null) {
      resultado = resultado.filter(p => p.areaId === areaFiltro);
    }

    if (tipoFiltro !== 'todos') {
      resultado = resultado.filter(p => p.tipo === tipoFiltro);
    }

    return resultado;
  }, [previsoes, areaFiltro, tipoFiltro]);

  const dadosComparativos = useMemo((): ComparativoData[] => {
    const todasDatas = new Set<string>();
    previsoesFiltradas.forEach(p => todasDatas.add(p.data));
    saldos.forEach(s => todasDatas.add(s.data));

    const datasOrdenadas = Array.from(todasDatas).sort();

    return datasOrdenadas.map(data => {
      const previsoesData = previsoesFiltradas.filter(p => p.data === data);
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
  }, [previsoesFiltradas, saldos]);

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

  const dadosGraficoReceitas = useMemo(() => {
    return dadosComparativos.map(d => ({
      data: formatarData(d.data),
      previsto: d.previsto_receitas,
      realizado: d.realizado_receitas
    }));
  }, [dadosComparativos]);

  const dadosGraficoDespesas = useMemo(() => {
    return dadosComparativos.map(d => ({
      data: formatarData(d.data),
      previsto: d.previsto_despesas,
      realizado: d.realizado_despesas
    }));
  }, [dadosComparativos]);

  const renderVariacao = (variacao: number) => {
    const cor = variacao >= 0 ? 'text-success-700' : 'text-error-700';
    const sinal = variacao >= 0 ? '+' : '';
    return (
      <span className={`text-sm font-semibold ${cor}`}>
        {sinal}{variacao.toFixed(1)}%
      </span>
    );
  };

  const maxValorGrafico = useMemo(() => {
    const maxReceitas = Math.max(...dadosGraficoReceitas.flatMap(d => [d.previsto, d.realizado]));
    const maxDespesas = Math.max(...dadosGraficoDespesas.flatMap(d => [d.previsto, d.realizado]));
    return Math.max(maxReceitas, maxDespesas);
  }, [dadosGraficoReceitas, dadosGraficoDespesas]);

  return (
    <>
      <Header
        title="Previsto x Realizado"
        subtitle="Compare metas planejadas com os resultados alcançados"
      />

      <div className="page-content space-y-6">
        {/* Filtros de período e área */}
        <Card title="Filtros de Análise">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Data Início
              </label>
              <input
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Área
              </label>
              <select
                value={areaFiltro ?? ''}
                onChange={(e) => setAreaFiltro(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Todas as áreas</option>
                {areas.map(area => (
                  <option key={area.id} value={area.id}>{area.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Tipo
              </label>
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value as 'todos' | 'receita' | 'gasto')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="receita">Receitas</option>
                <option value="gasto">Despesas</option>
              </select>
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

            {/* Seletor de Tipo de Gráfico */}
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Visualização dos Gráficos</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTipoGrafico('barras')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      tipoGrafico === 'barras'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Barras Verticais
                  </button>
                  <button
                    onClick={() => setTipoGrafico('linhas')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      tipoGrafico === 'linhas'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Linhas
                  </button>
                </div>
              </div>
            </Card>

            {/* Gráficos Comparativos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Gráfico de Receitas */}
              <Card title="Receitas - Previsto x Realizado">
                {tipoGrafico === 'barras' ? (
                  <BarrasVerticaisChart
                    dados={dadosGraficoReceitas}
                    corPrevisto="#3b82f6"
                    corRealizado="#10b981"
                  />
                ) : (
                  <LinhasChart
                    dados={dadosGraficoReceitas}
                    corPrevisto="#3b82f6"
                    corRealizado="#10b981"
                  />
                )}
              </Card>

              {/* Gráfico de Despesas */}
              <Card title="Despesas - Previsto x Realizado">
                {tipoGrafico === 'barras' ? (
                  <BarrasVerticaisChart
                    dados={dadosGraficoDespesas}
                    corPrevisto="#f97316"
                    corRealizado="#ef4444"
                  />
                ) : (
                  <LinhasChart
                    dados={dadosGraficoDespesas}
                    corPrevisto="#f97316"
                    corRealizado="#ef4444"
                  />
                )}
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
                    {dadosComparativos.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                          Nenhum dado encontrado para o período e filtros selecionados
                        </td>
                      </tr>
                    ) : (
                      dadosComparativos.map((item) => (
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
                      ))
                    )}
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
