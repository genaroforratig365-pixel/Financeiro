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
          <Card
            title="Saldo Diário"
            subtitle="Compare valores previstos e realizados de receitas, gastos e saldos bancários de uma data específica."
            variant="success"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Gere um relatório consolidado do dia, com totais por área, categoria de receita e bancos, pronto para exportação em PDF.
              </p>
              <Link href="/relatorios/saldo-diario" className="inline-block">
                <Button variant="primary">Abrir relatório</Button>
              </Link>
            </div>
          </Card>
          <Card
            title="Cobrança"
            subtitle="Visualize o acompanhamento diário de recebimentos previstos versus realizados por banco e conta."
            variant="primary"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Gere um demonstrativo das cobranças por período, com totais diários e totais consolidados, pronto para exportar
                em PDF ou compartilhar por e-mail.
              </p>
              <Link href="/relatorios/cobranca" className="inline-block">
                <Button variant="primary">Abrir relatório</Button>
              </Link>
            </div>
          </Card>
          <Card
            title="Auditoria de Saldos"
            subtitle="Concilie o saldo registrado na previsão com os saldos diários informados pelos bancos."
            variant="danger"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Identifique divergências entre os saldos informados e a consolidação diária de cada banco.
              </p>
              <Link href="/auditoria/saldos-diarios" className="inline-block">
                <Button variant="primary">Abrir auditoria</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

export default RelatoriosHomePage;
