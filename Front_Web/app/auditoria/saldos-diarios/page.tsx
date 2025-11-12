'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Header } from '@/components/layout';
import { Card, Input, Loading } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import { getSupabaseClient } from '@/lib/supabaseClient';

interface SaldoBancoRow {
  sdb_data: string;
  sdb_saldo: number;
  sdb_ban_id: number | null;
  ban_bancos: { ban_nome?: string | null } | { ban_nome?: string | null }[] | null;
}

interface PrevisaoSaldoRow {
  pvi_data: string;
  pvi_tipo: string;
  pvi_valor: number;
}

interface AuditoriaLinha {
  data: string;
  bancos: Record<string, number>;
  somaBancos: number;
  saldoRegistrado: number;
  diferenca: number;
}

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const gerarIntervaloDatas = (inicio: string, fim: string): string[] => {
  if (!inicio) {
    return [];
  }
  const datas: string[] = [];
  const dataInicio = new Date(`${inicio}T00:00:00`);
  const dataFim = fim ? new Date(`${fim}T00:00:00`) : dataInicio;
  const atual = new Date(dataInicio);
  while (atual <= dataFim) {
    datas.push(toISODate(atual));
    atual.setDate(atual.getDate() + 1);
  }
  return datas;
};

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

const extrairRelacao = <T,>(valor: T | T[] | null | undefined): T | null => {
  if (!valor) {
    return null;
  }
  return Array.isArray(valor) ? valor[0] ?? null : valor;
};

const AuditoriaSaldosDiariosPage: React.FC = () => {
  const hoje = useMemo(() => new Date(), []);
  const [periodoFim, setPeriodoFim] = useState(() => toISODate(hoje));
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 6);
    return toISODate(inicio);
  });

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<AuditoriaLinha[]>([]);
  const [bancos, setBancos] = useState<string[]>([]);

  const carregarAuditoria = useCallback(
    async (inicio: string, fim: string) => {
      try {
        setCarregando(true);
        setErro(null);
        const supabase = getSupabaseClient();

        const [saldosRes, previsaoRes] = await Promise.all([
          supabase
            .from('sdb_saldo_banco')
            .select('sdb_data, sdb_saldo, sdb_ban_id, ban_bancos(ban_nome)')
            .gte('sdb_data', inicio)
            .lte('sdb_data', fim),
          supabase
            .from('pvi_previsao_itens')
            .select('pvi_data, pvi_tipo, pvi_valor')
            .in('pvi_tipo', ['saldo_diario', 'saldo_acumulado'])
            .gte('pvi_data', inicio)
            .lte('pvi_data', fim),
        ]);

        if (saldosRes.error) throw saldosRes.error;
        if (previsaoRes.error) throw previsaoRes.error;

        const saldos = (saldosRes.data as SaldoBancoRow[] | null) ?? [];
        const previsoes = (previsaoRes.data as PrevisaoSaldoRow[] | null) ?? [];

        const bancosUnicos = Array.from(
          new Set(
            saldos.map((item) => extrairRelacao(item.ban_bancos)?.ban_nome?.trim() || 'Banco não informado'),
          ),
        ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

        const mapaSaldosPorData = new Map<string, Map<string, number>>();
        saldos.forEach((item) => {
          const relacao = extrairRelacao(item.ban_bancos);
          const nome = relacao?.ban_nome?.trim() || 'Banco não informado';
          const valor = Number(item.sdb_saldo ?? 0);
          const mapaDia = mapaSaldosPorData.get(item.sdb_data) ?? new Map<string, number>();
          mapaDia.set(nome, (mapaDia.get(nome) ?? 0) + valor);
          mapaSaldosPorData.set(item.sdb_data, mapaDia);
        });

        const mapaPrevisao = new Map<string, number>();
        previsoes.forEach((item) => {
          const valor = Number(item.pvi_valor ?? 0);
          const existente = mapaPrevisao.get(item.pvi_data);
          if (item.pvi_tipo === 'saldo_diario' || existente === undefined) {
            mapaPrevisao.set(item.pvi_data, valor);
          }
        });

        const datas = gerarIntervaloDatas(inicio, fim);
        const linhasCalculadas: AuditoriaLinha[] = datas
          .map((data) => {
            const mapaDia = mapaSaldosPorData.get(data) ?? new Map<string, number>();
            const bancosDia: Record<string, number> = {};
            let somaBancos = 0;
            bancosUnicos.forEach((nome) => {
              const valor = Number((mapaDia.get(nome) ?? 0).toFixed(2));
              bancosDia[nome] = valor;
              somaBancos += valor;
            });
            const saldoRegistrado = Number((mapaPrevisao.get(data) ?? 0).toFixed(2));
            const diferenca = Number((somaBancos - saldoRegistrado).toFixed(2));
            const possuiDados = somaBancos !== 0 || saldoRegistrado !== 0;
            if (!possuiDados) {
              return null;
            }
            return {
              data,
              bancos: bancosDia,
              somaBancos,
              saldoRegistrado,
              diferenca,
            };
          })
          .filter((item): item is AuditoriaLinha => item !== null)
          .sort((a, b) => b.data.localeCompare(a.data));

        setLinhas(linhasCalculadas);
        setBancos(bancosUnicos);
      } catch (error) {
        console.error('Erro ao carregar auditoria de saldos diários:', error);
        setErro('Não foi possível carregar os dados de auditoria no momento.');
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!periodoInicio || !periodoFim) {
      return;
    }
    carregarAuditoria(periodoInicio, periodoFim);
  }, [carregarAuditoria, periodoInicio, periodoFim]);

  const intervaloDatas = useMemo(
    () => gerarIntervaloDatas(periodoInicio, periodoFim),
    [periodoInicio, periodoFim],
  );

  const totaisResumo = useMemo(() => {
    if (!linhas.length) {
      return { diasComDado: 0, divergencias: 0, maiorDiferenca: 0 };
    }
    const divergencias = linhas.filter((linha) => Math.abs(linha.diferenca) > 0.009);
    const maiorDiferenca = divergencias.reduce(
      (acc, linha) => (Math.abs(linha.diferenca) > Math.abs(acc) ? linha.diferenca : acc),
      0,
    );
    return {
      diasComDado: linhas.length,
      divergencias: divergencias.length,
      maiorDiferenca,
    };
  }, [linhas]);

  return (
    <>
      <Header
        title="Auditoria de Saldos Diários"
        subtitle="Compare os saldos registrados nos bancos com o saldo final informado na previsão diária"
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              type="date"
              label="Início"
              value={periodoInicio}
              onChange={(event) => {
                const valor = event.target.value;
                setPeriodoInicio(valor);
                if (valor && valor > periodoFim) {
                  setPeriodoFim(valor);
                }
              }}
            />
            <Input
              type="date"
              label="Fim"
              min={periodoInicio}
              value={periodoFim}
              onChange={(event) => setPeriodoFim(event.target.value)}
            />
            <div className="text-sm text-gray-500">
              Intervalo com {intervaloDatas.length} dia(s)
            </div>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <Card variant="danger" title="Não foi possível carregar a auditoria">
            <p className="text-sm text-error-700">{erro}</p>
          </Card>
        )}

        {carregando ? (
          <div className="flex justify-center py-12">
            <Loading text="Compilando saldos por banco..." />
          </div>
        ) : (
          <>
            <Card
              title="Resumo da Auditoria"
              subtitle="Indicadores do período analisado"
              variant="primary"
            >
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Dias com movimentação
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">{totaisResumo.diasComDado}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Dias com divergência
                  </p>
                  <p className="text-2xl font-semibold text-error-600">{totaisResumo.divergencias}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Maior diferença absoluta
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(Math.abs(totaisResumo.maiorDiferenca))}
                  </p>
                </div>
              </div>
            </Card>

            <Card
              title="Detalhamento por dia"
              subtitle="Saldos consolidados por banco comparados com o saldo final informado"
            >
              {linhas.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhum saldo foi encontrado para o período selecionado. Ajuste as datas para ampliar a busca.
                </p>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm text-gray-700">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        {bancos.map((banco) => (
                          <th key={banco} className="px-3 py-2 text-right">
                            {banco}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-right">Soma Bancos</th>
                        <th className="px-3 py-2 text-right">Saldo Final Registrado</th>
                        <th className="px-3 py-2 text-right">Diferença</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {linhas.map((linha) => (
                        <tr key={linha.data}>
                          <td className="px-3 py-2 text-left font-medium text-gray-900">
                            {formatarDataPt(linha.data)}
                          </td>
                          {bancos.map((banco) => (
                            <td key={`${linha.data}-${banco}`} className="px-3 py-2 text-right">
                              {formatCurrency(linha.bancos[banco] ?? 0)}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                            {formatCurrency(linha.somaBancos)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                            {formatCurrency(linha.saldoRegistrado)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-semibold ${
                              linha.diferenca === 0
                                ? 'text-gray-600'
                                : linha.diferenca > 0
                                ? 'text-error-600'
                                : 'text-success-600'
                            }`}
                          >
                            {formatCurrency(linha.diferenca)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
};

export default AuditoriaSaldosDiariosPage;
