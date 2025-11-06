'use client';

import React from 'react';
import { Header } from '@/components/layout';
import { Card } from '@/components/ui';

export default function RecebimentosPage() {
  return (
    <>
      <Header
        title="Recebimentos"
        subtitle="Visualize as entradas confirmadas e previstas por conta de receita"
      />

      <div className="page-content space-y-6">
        <Card title="Resumo" subtitle="Planejamento em andamento">
          <p className="text-sm text-gray-600">
            A tela de recebimentos irá consolidar os dados por conta e origem, destacando o
            que já foi liquidado e o que ainda está previsto para cair nas próximas datas.
          </p>
        </Card>

        <Card title="Próximos passos">
          <ul className="list-disc pl-5 text-sm text-gray-600 space-y-2">
            <li>Sincronizar com os cadastros de contas de receita recém-criados.</li>
            <li>Permitir reconciliação rápida com extratos importados.</li>
            <li>Disponibilizar exportação em planilhas segmentadas por centro de custo.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
