'use client';

import React from 'react';
import { Header } from '@/components/layout';
import { Card } from '@/components/ui';

export default function PrevistoRealizadoPage() {
  return (
    <>
      <Header
        title="Previsto x Realizado"
        subtitle="Compare metas planejadas com os resultados alcançados"
      />

      <div className="page-content space-y-6">
        <Card title="Comparativo mensal" subtitle="Em construção">
          <p className="text-sm text-gray-600">
            Aqui serão exibidos gráficos de acompanhamento com variação percentual entre o
            previsto e o realizado, permitindo identificar rapidamente desvios e oportunidades.
          </p>
        </Card>

        <Card title="Roadmap">
          <ul className="list-disc pl-5 text-sm text-gray-600 space-y-2">
            <li>Definição de metas mensais e trimestrais a partir dos cadastros.</li>
            <li>Integração com o módulo de notificações por e-mail recém-planejado.</li>
            <li>Alertas automáticos quando o desvio ultrapassar limites configurados.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
