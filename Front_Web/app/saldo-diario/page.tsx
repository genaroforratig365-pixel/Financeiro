/**
 * Saldo Diário - Tela Principal
 * Dashboard com 4 blocos operacionais
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout';
import { Card, Button, Loading } from '@/components/ui';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { formatCurrency } from '@/lib/mathParser';

// Tipos
interface PagamentoArea {
  pag_id: number;
  pag_valor: number;
  pag_descricao: string;
  are_areas: { are_nome: string };
}

interface Receita {
  rec_id: number;
  rec_valor: number;
  rec_descricao: string;
  ctr_contas_receita: { ctr_nome: string };
}

interface PagamentoBanco {
  pbk_id: number;
  pbk_valor: number;
  pbk_descricao: string;
  ban_bancos: { ban_nome: string };
}

interface SaldoBanco {
  sdb_id: number;
  sdb_saldo: number;
  ban_bancos: { ban_nome: string };
}

export default function SaldoDiarioPage() {
  const [loading, setLoading] = useState(true);
  const [pagamentosArea, setPagamentosArea] = useState<PagamentoArea[]>([]);
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [pagamentosBanco, setPagamentosBanco] = useState<PagamentoBanco[]>([]);
  const [saldosBanco, setSaldosBanco] = useState<SaldoBanco[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { userId } = getUserSession();
      const supabase = getSupabaseClient();
      const { data: user } = await getOrCreateUser(supabase, userId);

      if (!user) return;

      const hoje = new Date().toISOString().split('T')[0];

      // Carregar dados dos 4 blocos em paralelo
      const [pagAreaRes, recRes, pagBancoRes, saldoRes] = await Promise.all([
        // Pagamentos por Área (hoje)
        supabase
          .from('pag_pagamentos_area')
          .select('pag_id, pag_valor, pag_descricao, are_areas(are_nome)')
          .eq('pag_usr_id', user.usr_id)
          .eq('pag_data', hoje)
          .order('pag_criado_em', { ascending: false })
          .limit(5),

        // Receitas (hoje)
        supabase
          .from('rec_receitas')
          .select('rec_id, rec_valor, rec_descricao, ctr_contas_receita(ctr_nome)')
          .eq('rec_usr_id', user.usr_id)
          .eq('rec_data', hoje)
          .order('rec_criado_em', { ascending: false })
          .limit(5),

        // Pagamentos por Banco (hoje)
        supabase
          .from('pbk_pagamentos_banco')
          .select('pbk_id, pbk_valor, pbk_descricao, ban_bancos(ban_nome)')
          .eq('pbk_usr_id', user.usr_id)
          .eq('pbk_data', hoje)
          .order('pbk_criado_em', { ascending: false })
          .limit(5),

        // Saldos por Banco (último de cada banco)
        supabase
          .from('sdb_saldo_banco')
          .select('sdb_id, sdb_saldo, ban_bancos(ban_nome)')
          .eq('sdb_usr_id', user.usr_id)
          .order('sdb_data', { ascending: false })
          .limit(10),
      ]);

      setPagamentosArea((pagAreaRes.data as PagamentoArea[]) || []);
      setReceitas((recRes.data as Receita[]) || []);
      setPagamentosBanco((pagBancoRes.data as PagamentoBanco[]) || []);
      setSaldosBanco((saldoRes.data as SaldoBanco[]) || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Cálculo dos totais
  const totalPagamentosArea = pagamentosArea.reduce((sum, p) => sum + Number(p.pag_valor), 0);
  const totalReceitas = receitas.reduce((sum, r) => sum + Number(r.rec_valor), 0);
  const totalPagamentosBanco = pagamentosBanco.reduce((sum, p) => sum + Number(p.pbk_valor), 0);
  const totalSaldos = saldosBanco.reduce((sum, s) => sum + Number(s.sdb_saldo), 0);

  if (loading) {
    return (
      <>
        <Header title="Saldo Diário" />
        <div className="page-content flex items-center justify-center h-96">
          <Loading size="lg" text="Carregando dados..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Saldo Diário"
        subtitle={`Dashboard financeiro - ${new Date().toLocaleDateString('pt-BR')}`}
        actions={
          <Button variant="secondary" onClick={loadData}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Atualizar
          </Button>
        }
      />

      <div className="page-content">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* BLOCO 1: Pagamentos por Área */}
          <Card
            title="Pagamentos por Área"
            subtitle={`Total: ${formatCurrency(totalPagamentosArea)}`}
            variant="primary"
            headerAction={
              <Button size="sm" onClick={() => alert('Adicionar pagamento por área')}>
                + Adicionar
              </Button>
            }
          >
            {pagamentosArea.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Nenhum pagamento registrado hoje
              </p>
            ) : (
              <ul className="space-y-2">
                {pagamentosArea.map((pag) => (
                  <li
                    key={pag.pag_id}
                    className="flex justify-between items-start p-3 bg-gray-50 rounded-md"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {pag.are_areas?.are_nome || 'Área removida'}
                      </p>
                      <p className="text-sm text-gray-500">{pag.pag_descricao}</p>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(pag.pag_valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* BLOCO 2: Receitas por Conta */}
          <Card
            title="Receitas"
            subtitle={`Total: ${formatCurrency(totalReceitas)}`}
            variant="success"
            headerAction={
              <Button size="sm" onClick={() => alert('Adicionar receita')}>
                + Adicionar
              </Button>
            }
          >
            {receitas.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Nenhuma receita registrada hoje
              </p>
            ) : (
              <ul className="space-y-2">
                {receitas.map((rec) => (
                  <li
                    key={rec.rec_id}
                    className="flex justify-between items-start p-3 bg-gray-50 rounded-md"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {rec.ctr_contas_receita?.ctr_nome || 'Conta removida'}
                      </p>
                      <p className="text-sm text-gray-500">{rec.rec_descricao}</p>
                    </div>
                    <span className="font-semibold text-success-700">
                      {formatCurrency(rec.rec_valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* BLOCO 3: Pagamentos por Banco */}
          <Card
            title="Pagamentos por Banco"
            subtitle={`Total: ${formatCurrency(totalPagamentosBanco)}`}
            variant="danger"
            headerAction={
              <Button size="sm" onClick={() => alert('Adicionar pagamento por banco')}>
                + Adicionar
              </Button>
            }
          >
            {pagamentosBanco.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Nenhum pagamento registrado hoje
              </p>
            ) : (
              <ul className="space-y-2">
                {pagamentosBanco.map((pag) => (
                  <li
                    key={pag.pbk_id}
                    className="flex justify-between items-start p-3 bg-gray-50 rounded-md"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {pag.ban_bancos?.ban_nome || 'Banco removido'}
                      </p>
                      <p className="text-sm text-gray-500">{pag.pbk_descricao}</p>
                    </div>
                    <span className="font-semibold text-error-700">
                      {formatCurrency(pag.pbk_valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* BLOCO 4: Saldo por Banco */}
          <Card
            title="Saldo por Banco"
            subtitle={`Total: ${formatCurrency(totalSaldos)}`}
            variant="default"
            headerAction={
              <Button size="sm" onClick={() => alert('Atualizar saldo')}>
                + Atualizar
              </Button>
            }
          >
            {saldosBanco.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Nenhum saldo registrado
              </p>
            ) : (
              <ul className="space-y-2">
                {saldosBanco.map((saldo) => (
                  <li
                    key={saldo.sdb_id}
                    className="flex justify-between items-start p-3 bg-gray-50 rounded-md"
                  >
                    <p className="font-medium text-gray-900">
                      {saldo.ban_bancos?.ban_nome || 'Banco removido'}
                    </p>
                    <span
                      className={`font-semibold ${
                        saldo.sdb_saldo >= 0 ? 'text-success-700' : 'text-error-700'
                      }`}
                    >
                      {formatCurrency(saldo.sdb_saldo)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
