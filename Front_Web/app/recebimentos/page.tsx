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

interface ResumoTipo {
  tipo: string;
  total: number;
  quantidade: number;
}

interface ResumoConta {
  conta: string;
  codigo: string;
  total: number;
  quantidade: number;
}

interface ResumoBanco {
  banco: string;
  total: number;
  quantidade: number;
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
                tpr_nome
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

        if (error) throw error;

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
              tpr_nome: tipo.tpr_nome
            } : null,
            banco: banco ? {
              ban_id: banco.ban_id,
              ban_nome: banco.ban_nome
            } : null
          };
        });

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

  const resumoPorTipo = useMemo((): ResumoTipo[] => {
    const mapa = new Map<string, { total: number; quantidade: number }>();

    receitas.forEach(rec => {
      const tipo = rec.tipo_receita?.tpr_nome || 'Sem tipo';
      const atual = mapa.get(tipo) || { total: 0, quantidade: 0 };
      mapa.set(tipo, {
        total: atual.total + rec.rec_valor,
        quantidade: atual.quantidade + 1
      });
    });

    return Array.from(mapa.entries())
      .map(([tipo, dados]) => ({ tipo, ...dados }))
      .sort((a, b) => b.total - a.total);
  }, [receitas]);

  const resumoPorConta = useMemo((): ResumoConta[] => {
    const mapa = new Map<string, { codigo: string; total: number; quantidade: number }>();

    receitas.forEach(rec => {
      const conta = rec.conta_receita?.ctr_nome || 'Sem conta';
      const codigo = rec.conta_receita?.ctr_codigo || '';
      const atual = mapa.get(conta) || { codigo, total: 0, quantidade: 0 };
      mapa.set(conta, {
        codigo,
        total: atual.total + rec.rec_valor,
        quantidade: atual.quantidade + 1
      });
    });

    return Array.from(mapa.entries())
      .map(([conta, dados]) => ({ conta, ...dados }))
      .sort((a, b) => b.total - a.total);
  }, [receitas]);

  const resumoPorBanco = useMemo((): ResumoBanco[] => {
    const mapa = new Map<string, { total: number; quantidade: number }>();

    receitas.forEach(rec => {
      const banco = rec.banco?.ban_nome || 'Sem banco';
      const atual = mapa.get(banco) || { total: 0, quantidade: 0 };
      mapa.set(banco, {
        total: atual.total + rec.rec_valor,
        quantidade: atual.quantidade + 1
      });
    });

    return Array.from(mapa.entries())
      .map(([banco, dados]) => ({ banco, ...dados }))
      .sort((a, b) => b.total - a.total);
  }, [receitas]);

  const formatarData = (data: string) => {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  return (
    <>
      <Header
        title="Dashboard de Recebimentos"
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
            {/* KPI Principal */}
            <Card title="Total de Recebimentos" variant="success">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-bold text-success-700">
                    {formatCurrency(totalGeral)}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    {receitas.length} recebimento{receitas.length !== 1 ? 's' : ''} no período
                  </p>
                </div>
              </div>
            </Card>

            {/* Resumo por Tipo de Receita */}
            <Card title="Análise por Tipo de Receita">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        Quantidade
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        Total
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        % do Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {resumoPorTipo.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                          Nenhuma receita encontrada no período selecionado
                        </td>
                      </tr>
                    ) : (
                      resumoPorTipo.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {item.tipo}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {item.quantidade}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-success-700">
                            {formatCurrency(item.total)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {((item.total / totalGeral) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Resumo por Conta de Receita */}
            <Card title="Análise por Conta de Receita">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">
                        Código
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">
                        Conta
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        Quantidade
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        Total
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        % do Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {resumoPorConta.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                          Nenhuma receita encontrada no período selecionado
                        </td>
                      </tr>
                    ) : (
                      resumoPorConta.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">
                            {item.codigo || '-'}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {item.conta}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {item.quantidade}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-success-700">
                            {formatCurrency(item.total)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {((item.total / totalGeral) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Resumo por Banco */}
            <Card title="Análise por Banco">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">
                        Banco
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        Quantidade
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        Total
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        % do Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {resumoPorBanco.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                          Nenhuma receita encontrada no período selecionado
                        </td>
                      </tr>
                    ) : (
                      resumoPorBanco.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {item.banco}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {item.quantidade}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-success-700">
                            {formatCurrency(item.total)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {((item.total / totalGeral) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

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
                          <td className="px-4 py-3 text-gray-600">
                            {rec.tipo_receita?.tpr_nome || '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {rec.conta_receita?.ctr_nome || '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
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
