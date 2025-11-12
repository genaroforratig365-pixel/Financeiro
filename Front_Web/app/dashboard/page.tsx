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

        // Todos os usuários podem visualizar todos os dados
        const [pagamentos, recebimentos] = await Promise.all([
          supabase
            .from('pag_pagamentos_area')
            .select('pag_valor')
            .gte('pag_data', hoje)
            .limit(1000),
          supabase
            .from('rec_receitas')
            .select('rec_valor')
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
        title="Germani Alimentos"
        subtitle={`Bem-vindo, ${session.displayName}`}
      />

      <div className="page-content">
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
          <div className="w-full max-w-4xl text-center space-y-8">
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <img
                src="https://static.wixstatic.com/media/ce3165_c01db19c0ef64e2abb8c894c7ecc6f95~mv2.png/v1/fill/w_322,h_138,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logomarca-Germani-2023-Branca-borda-dour.png"
                alt="Germani Alimentos"
                className="h-32 w-auto"
              />
            </div>

            {/* Informações da Empresa */}
            <div className="space-y-4">
              <h1 className="text-4xl font-bold text-gray-900">Germani Alimentos LTDA</h1>
              <p className="text-xl text-gray-600">Sistema de Gestão Financeira</p>
            </div>

            {/* Operador Ativo */}
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#C1272D]/20 bg-white px-6 py-3 shadow-lg">
              <svg className="h-5 w-5 text-[#C1272D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">
                Operador: <strong className="text-[#C1272D]">{session.displayName}</strong>
              </span>
            </div>

            {/* Link para o Site */}
            <div className="pt-8">
              <a
                href="https://www.germani.com.br/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#C1272D] px-6 py-3 text-white font-semibold hover:bg-[#A01F24] transition shadow-lg hover:shadow-xl"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                Visite nosso site
              </a>
            </div>

            {/* Módulos de Acesso Rápido */}
            <div className="pt-12">
              <h2 className="text-lg font-semibold text-gray-700 mb-6">Módulos Disponíveis</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {modulos.map((modulo) => (
                  <Link
                    key={modulo.titulo}
                    href={modulo.href}
                    className="group rounded-lg border-2 border-gray-200 bg-white p-4 hover:border-[#C1272D] hover:shadow-lg transition"
                  >
                    <h3 className="font-semibold text-gray-900 group-hover:text-[#C1272D] transition">
                      {modulo.titulo}
                    </h3>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
