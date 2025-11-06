'use client';

import React, { useEffect, useState } from 'react';
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

export default function DashboardPage() {
  const [resumo, setResumo] = useState<IndicadoresResumo>(initialResumo);
  const [loading, setLoading] = useState(true);

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
        subtitle="Acompanhe o panorama financeiro diário e os principais indicadores"
      />

      <div className="page-content">
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
