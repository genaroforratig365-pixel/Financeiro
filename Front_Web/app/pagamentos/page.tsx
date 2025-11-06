'use client';

import React from 'react';
import { Header } from '@/components/layout';
import { Card } from '@/components/ui';

export default function PagamentosPage() {
  return (
    <>
      <Header
        title="Pagamentos"
        subtitle="Centralize e acompanhe todos os pagamentos por área e banco"
      />

      <div className="page-content space-y-6">
        <Card title="Visão geral" subtitle="Em breve">
          <p className="text-sm text-gray-600">
            Esta seção exibirá uma grade completa dos pagamentos realizados e programados,
            permitindo filtros por área, conta bancária e período.
          </p>
        </Card>

        <Card title="Próximos passos">
          <ul className="list-disc pl-5 text-sm text-gray-600 space-y-2">
            <li>Importação dos lançamentos recorrentes e parcelados.</li>
            <li>Integração com o cadastro de áreas e bancos recém-implantado.</li>
            <li>Atalhos para criar pagamentos diretamente a partir do saldo diário.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
