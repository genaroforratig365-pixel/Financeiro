'use client';

import React from 'react';
import Link from 'next/link';

import { Header } from '@/components/layout';
import { Button, Card } from '@/components/ui';

const RelatoriosHomePage: React.FC = () => {
  return (
    <>
      <Header
        title="Relatórios"
        subtitle="Consulte e exporte relatórios financeiros consolidados"
      />

      <div className="page-content">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Card
            title="Previsão Semanal"
            subtitle="Resumo previsto de receitas, despesas e saldos para cada dia da semana selecionada."
            variant="primary"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Gere uma visualização completa da previsão semanal e exporte o conteúdo em PDF para compartilhar com a equipe.
              </p>
              <Link href="/relatorios/previsao-semanal" className="inline-block">
                <Button variant="primary">Abrir relatório</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

export default RelatoriosHomePage;
