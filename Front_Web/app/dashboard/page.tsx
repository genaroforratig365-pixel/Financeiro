'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

interface IndicadoresResumo {
  total_pagamentos: number;
  total_recebimentos: number;
  saldo_previsto: number;
  saldo_realizado: number;
}

const initialResumo: IndicadoresResumo = {
  total_pagamentos: 0,
  total_recebimentos: 0,
  saldo_previsto: 0,
  saldo_realizado: 0,
};

type ModuloNavegacao = {
  titulo: string;
  descricao: string;
  href: string;
  destaque?: string;
};

export default function DashboardPage() {
  const [resumo, setResumo] = useState<IndicadoresResumo>(initialResumo);
  const [loading, setLoading] = useState(true);
  const session = useMemo(() => getUserSession(), []);

  const modulos = useMemo<ModuloNavegacao[]>(
    () => [
      {
        titulo: 'Saldo Diário',
        descricao: 'Registre pagamentos, recebimentos e saldos do último dia útil.',
        href: '/saldo-diario',
      },
      {
        titulo: 'Pagamentos',
        descricao: 'Consolide desembolsos por área e acompanhe totais lançados.',
        href: '/pagamentos',
      },
      {
        titulo: 'Recebimentos',
        descricao: 'Confira entradas confirmadas e previsões por conta de receita.',
        href: '/recebimentos',
      },
      {
        titulo: 'Lançamento de Cobrança',
        descricao: 'Informe cobranças por conta de receita e tipo de receita.',
        href: '/cobrancas',
        destaque: 'Novo',
      },
      {
        titulo: 'Previsto x Realizado',
        descricao: 'Compare planejado e executado para identificar desvios.',
        href: '/previsto-realizado',
      },
      {
        titulo: 'Cadastros',
        descricao: 'Gerencie usuários, áreas, contas de receita e bancos.',
        href: '/cadastros/areas',
      },
    ],
    [],
  );

  useEffect(() => {
    const loadResumo = async () => {
      try {
        setLoading(true);
        const supabase = getSupabaseClient();
        const { userId, userName, userEmail } = getUserSession();
        const { data: user } = await getOrCreateUser(
          supabase,
          userId,
          userName ?? undefined,
          userEmail ?? undefined,
        );

        if (!user) {
          return;
        }

        const hoje = new Date().toISOString().split('T')[0];

        const [pagamentos, recebimentos] = await Promise.all([
          supabase
            .from('pag_pagamentos_area')
            .select('pag_valor')
            .eq('pag_usr_id', user.usr_id)
            .gte('pag_data', hoje)
            .limit(1000),
          supabase
            .from('rec_receitas')
            .select('rec_valor')
            .eq('rec_usr_id', user.usr_id)
            .gte('rec_data', hoje)
            .limit(1000),
        ]);

        const totalPagamentos = (pagamentos.data ?? []).reduce(
          (acc, item: any) => acc + Number(item.pag_valor ?? 0),
          0,
        );
        const totalRecebimentos = (recebimentos.data ?? []).reduce(
          (acc, item: any) => acc + Number(item.rec_valor ?? 0),
          0,
        );

        setResumo({
          total_pagamentos: totalPagamentos,
          total_recebimentos: totalRecebimentos,
          saldo_previsto: totalRecebimentos - totalPagamentos,
          saldo_realizado: totalRecebimentos - totalPagamentos,
        });
      } catch (error) {
        console.error('Erro ao carregar resumo do dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadResumo();
  }, []);

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Bem-vindo ao painel central. Escolha um módulo para começar."
      />

      <div className="page-content space-y-6">
        <Card>
          <div className="space-y-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-gray-500">Operador ativo</p>
                <h2 className="text-xl font-semibold text-gray-900">{session.displayName}</h2>
                {session.userEmail && (
                  <p className="text-sm text-gray-500">{session.userEmail}</p>
                )}
              </div>
              <div className="rounded-lg border border-primary-100 bg-primary-50/40 px-4 py-3 text-sm text-primary-700">
                Escolha um módulo abaixo para registrar ou consultar os dados do dia.
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {modulos.map((modulo) => (
                <Link
                  key={modulo.titulo}
                  href={modulo.href}
                  className="group flex h-full flex-col justify-between rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900 group-hover:text-primary-700">
                        {modulo.titulo}
                      </h3>
                      {modulo.destaque && (
                        <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700">
                          {modulo.destaque}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{modulo.descricao}</p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600">
                    Acessar módulo
                    <svg
                      className="h-4 w-4 transition group-hover:translate-x-1"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loading text="Calculando indicadores..." />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card
              title="Pagamentos do Dia"
              subtitle={formatCurrency(resumo.total_pagamentos)}
              variant="danger"
            >
              <p className="text-sm text-gray-600">
                Total consolidado dos pagamentos registrados para hoje.
              </p>
            </Card>

            <Card
              title="Recebimentos do Dia"
              subtitle={formatCurrency(resumo.total_recebimentos)}
              variant="success"
            >
              <p className="text-sm text-gray-600">
                Receitas confirmadas nas contas cadastradas.
              </p>
            </Card>

            <Card
              title="Saldo Previsto"
              subtitle={formatCurrency(resumo.saldo_previsto)}
              variant="primary"
            >
              <p className="text-sm text-gray-600">
                Resultado financeiro esperado considerando lançamentos programados.
              </p>
            </Card>

            <Card
              title="Saldo Realizado"
              subtitle={formatCurrency(resumo.saldo_realizado)}
            >
              <p className="text-sm text-gray-600">
                Resultado após compensações confirmadas em bancos e áreas.
              </p>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
