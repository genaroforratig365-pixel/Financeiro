'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { formatCurrency } from '@/lib/mathParser';

interface ReceitaDetalhada {
  rec_id: number;
  rec_valor: number;
  rec_data: string;
  rec_ctr_id: number;
  tipo_receita?: {
    tpr_id: number;
    tpr_nome: string;
    tpr_codigo: string;
  } | null;
  conta_receita?: {
    ctr_id: number;
    ctr_nome: string;
    ctr_codigo: string;
  } | null;
  banco?: {
    ban_id: number;
    ban_nome: string;
  } | null;
}

interface ResumoCategoria {
  categoria: string;
  total: number;
  percentual: number;
}

interface DadosGrafico {
  nome: string;
  valor: number;
}

export default function RecebimentosPage() {
  const [carregando, setCarregando] = useState(true);
  const [receitas, setReceitas] = useState<ReceitaDetalhada[]>([]);
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');

  useEffect(() => {
    // Define período padrão: mês atual
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    const formatarData = (d: Date) => d.toISOString().split('T')[0];
    setPeriodoInicio(formatarData(inicioMes));
    setPeriodoFim(formatarData(fimMes));
  }, []);

  useEffect(() => {
    if (!periodoInicio || !periodoFim) return;

    const carregarReceitas = async () => {
      setCarregando(true);
      try {
        const supabase = getSupabaseClient();

        console.log('=== DEBUG Recebimentos ===');
        console.log('Período:', periodoInicio, 'até', periodoFim);

        const { data, error } = await supabase
          .from('rec_receitas')
          .select(`
            rec_id,
            rec_valor,
            rec_data,
            rec_ctr_id,
            ctr_contas_receita!rec_ctr_id (
              ctr_id,
              ctr_nome,
              ctr_codigo,
              ctr_tpr_id,
              tpr_tipos_receita!ctr_tpr_id (
                tpr_id,
                tpr_nome,
                tpr_codigo
              ),
              ctr_ban_id,
              ban_bancos!ctr_ban_id (
                ban_id,
                ban_nome
              )
            )
          `)
          .gte('rec_data', periodoInicio)
          .lte('rec_data', periodoFim)
          .order('rec_data', { ascending: false });

        console.log('Dados retornados:', data);
        console.log('Quantidade:', data?.length || 0);
        if (error) {
          console.error('Erro ao buscar:', error);
          throw error;
        }

        // Transformar dados para estrutura mais limpa
        const receitasFormatadas = (data || []).map((rec: any) => {
          const conta = Array.isArray(rec.ctr_contas_receita)
            ? rec.ctr_contas_receita[0]
            : rec.ctr_contas_receita;

          const tipo = conta?.tpr_tipos_receita
            ? (Array.isArray(conta.tpr_tipos_receita) ? conta.tpr_tipos_receita[0] : conta.tpr_tipos_receita)
            : null;

          const banco = conta?.ban_bancos
            ? (Array.isArray(conta.ban_bancos) ? conta.ban_bancos[0] : conta.ban_bancos)
            : null;

          return {
            rec_id: rec.rec_id,
            rec_valor: rec.rec_valor,
            rec_data: rec.rec_data,
            rec_ctr_id: rec.rec_ctr_id,
            conta_receita: conta ? {
              ctr_id: conta.ctr_id,
              ctr_nome: conta.ctr_nome,
              ctr_codigo: conta.ctr_codigo
            } : null,
            tipo_receita: tipo ? {
              tpr_id: tipo.tpr_id,
              tpr_nome: tipo.tpr_nome,
              tpr_codigo: tipo.tpr_codigo || ''
            } : null,
            banco: banco ? {
              ban_id: banco.ban_id,
              ban_nome: banco.ban_nome
            } : null
          };
        });

        console.log('Receitas formatadas:', receitasFormatadas);
        setReceitas(receitasFormatadas);
      } catch (erro) {
        console.error('Erro ao carregar receitas:', erro);
      } finally {
        setCarregando(false);
      }
    };

    carregarReceitas();
  }, [periodoInicio, periodoFim]);

  const totalGeral = useMemo(() => {
    return receitas.reduce((sum, r) => sum + r.rec_valor, 0);
  }, [receitas]);

  // Cards de resumo por categoria
  const resumoCategorias = useMemo((): ResumoCategoria[] => {
    const categorias = new Map<string, number>();

    receitas.forEach(rec => {
      const codigo = rec.tipo_receita?.tpr_codigo || '';

      // Classificar por código de tipo
      if (codigo.startsWith('301')) {
        categorias.set('Receita Prevista', (categorias.get('Receita Prevista') || 0) + rec.rec_valor);
      } else if (codigo.startsWith('302')) {
        categorias.set('Atrasados', (categorias.get('Atrasados') || 0) + rec.rec_valor);
      } else if (codigo.startsWith('303')) {
        categorias.set('Adiantados', (categorias.get('Adiantados') || 0) + rec.rec_valor);
      } else if (codigo.startsWith('304')) {
        categorias.set('Exportação', (categorias.get('Exportação') || 0) + rec.rec_valor);
      } else {
        categorias.set('Outros', (categorias.get('Outros') || 0) + rec.rec_valor);
      }
    });

    return Array.from(categorias.entries()).map(([categoria, total]) => ({
      categoria,
      total,
      percentual: totalGeral > 0 ? (total / totalGeral) * 100 : 0
    }));
  }, [receitas, totalGeral]);

  // Dados para gráfico evolução por banco
  const dadosGraficoBancos = useMemo((): DadosGrafico[] => {
    const mapa = new Map<string, number>();

    receitas.forEach(rec => {
      const banco = rec.banco?.ban_nome || 'Sem banco';
      mapa.set(banco, (mapa.get(banco) || 0) + rec.rec_valor);
    });

    return Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [receitas]);

  // Dados para gráfico por tipo de conta
  const dadosGraficoContas = useMemo((): DadosGrafico[] => {
    const mapa = new Map<string, number>();

    receitas.forEach(rec => {
      const conta = rec.conta_receita?.ctr_nome || 'Sem conta';
      mapa.set(conta, (mapa.get(conta) || 0) + rec.rec_valor);
    });

    return Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [receitas]);

  // Dados para gráfico por tipo de receita
  const dadosGraficoTipos = useMemo((): DadosGrafico[] => {
    const mapa = new Map<string, number>();

    receitas.forEach(rec => {
      const tipo = rec.tipo_receita?.tpr_nome || 'Sem tipo';
      mapa.set(tipo, (mapa.get(tipo) || 0) + rec.rec_valor);
    });

    return Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [receitas]);

  const formatarData = (data: string) => {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const renderGraficoBarras = (dados: DadosGrafico[], titulo: string) => {
    const maxValor = Math.max(...dados.map(d => d.valor), 1);

    return (
      <Card title={titulo}>
        <div className="space-y-3">
          {dados.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Nenhum dado disponível</p>
          ) : (
            dados.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{item.nome}</span>
                  <span className="font-semibold text-success-700">{formatCurrency(item.valor)}</span>
                </div>
                <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-success-500 to-success-600 transition-all duration-500"
                    style={{ width: `${(item.valor / maxValor) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 text-right">
                  {((item.valor / totalGeral) * 100).toFixed(1)}% do total
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    );
  };

  return (
    <>
      <Header
        title="Recebimentos"
        subtitle="Análise detalhada das receitas por tipo, conta e banco"
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
              <Loading text="Carregando receitas..." />
            </div>
          </Card>
        ) : (
          <>
            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Total Geral */}
              <Card>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-600">Total de Recebimentos</h3>
                  <p className="text-3xl font-bold text-success-700">{formatCurrency(totalGeral)}</p>
                  <p className="text-xs text-gray-500">{receitas.length} recebimento(s)</p>
                </div>
              </Card>

              {/* Cards por Categoria */}
              {resumoCategorias.map((cat, idx) => (
                <Card key={idx}>
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-600">{cat.categoria}</h3>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(cat.total)}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-success-500"
                          style={{ width: `${cat.percentual}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-success-700">
                        {cat.percentual.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {renderGraficoBarras(dadosGraficoBancos, 'Recebimentos por Banco')}
              {renderGraficoBarras(dadosGraficoContas, 'Recebimentos por Conta')}
            </div>

            {renderGraficoBarras(dadosGraficoTipos, 'Recebimentos por Tipo de Receita')}

            {/* Lista Detalhada */}
            <Card title="Lista Completa de Recebimentos">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Data</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Conta</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Banco</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {receitas.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                          Nenhuma receita encontrada no período selecionado
                        </td>
                      </tr>
                    ) : (
                      receitas.map((rec) => (
                        <tr key={rec.rec_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-900">
                            {formatarData(rec.rec_data)}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {rec.tipo_receita?.tpr_nome || '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {rec.conta_receita?.ctr_nome || '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {rec.banco?.ban_nome || '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-success-700">
                            {formatCurrency(rec.rec_valor)}
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
