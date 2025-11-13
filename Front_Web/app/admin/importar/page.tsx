'use client';

import React, { useState } from 'react';
import { Header } from '@/components/layout';
import { Button, Card } from '@/components/ui';

type ResultadoImportacao = {
  success: boolean;
  sucesso: number;
  erro: number;
  total: number;
  erros?: string[];
  avisos?: string[];
  error?: string;
};

export default function ImportarHistoricoPage() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  const handleArquivoSelecionado = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setArquivo(file);
      setResultado(null);
    }
  };

  const handleImportar = async () => {
    if (!arquivo) {
      alert('Selecione um arquivo primeiro');
      return;
    }

    setImportando(true);
    setResultado(null);

    try {
      const formData = new FormData();
      formData.append('file', arquivo);

      const response = await fetch('/api/importar-historico', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao importar dados');
      }

      setResultado(data);
    } catch (error: any) {
      setResultado({
        success: false,
        sucesso: 0,
        erro: 0,
        total: 0,
        error: error.message,
      });
    } finally {
      setImportando(false);
    }
  };

  const handleLimpar = () => {
    setArquivo(null);
    setResultado(null);
    const input = document.getElementById('file-input') as HTMLInputElement;
    if (input) input.value = '';
  };

  return (
    <>
      <Header
        title="Importar Dados Históricos"
        subtitle="Upload de planilha Excel/CSV com dados de movimentação"
      />

      <div className="page-content space-y-6">
        {/* Instruções */}
        <Card title="📋 Instruções">
          <div className="space-y-4 text-sm text-gray-700">
            <p>
              <strong>1. Prepare seu arquivo:</strong> Use o template com as colunas:
              Registro (data DD/MM/YYYY), Area, Valor_Previsto, Valor_Realizado, Origem
            </p>
            <p>
              <strong>2. Tipos de Origem suportados:</strong>
            </p>
            <ul className="list-disc ml-6 space-y-1">
              <li><code className="bg-gray-100 px-2 py-1 rounded">Ajuste de Saldo de Aplicação</code> ou <code className="bg-gray-100 px-2 py-1 rounded">Saldo Inicial</code></li>
              <li><code className="bg-gray-100 px-2 py-1 rounded">Previsão por Área</code> (valores previstos de gastos)</li>
              <li><code className="bg-gray-100 px-2 py-1 rounded">Pagamentos por Área</code> (valores realizados de gastos)</li>
              <li><code className="bg-gray-100 px-2 py-1 rounded">Previsão de Receitas</code> (valores previstos de receitas)</li>
            </ul>
            <p className="text-yellow-700 bg-yellow-50 p-3 rounded">
              ⚠️ <strong>Nota:</strong> Receitas por tipo, saldos bancários e pagamentos por banco
              precisam de mapeamento manual e serão ignorados na importação automática.
            </p>
          </div>
        </Card>

        {/* Upload de Arquivo */}
        <Card title="📁 Selecionar Arquivo">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleArquivoSelecionado}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-primary-50 file:text-primary-700
                  hover:file:bg-primary-100
                  cursor-pointer"
              />
            </div>

            {arquivo && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span><strong>{arquivo.name}</strong> ({(arquivo.size / 1024).toFixed(2)} KB)</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={handleImportar}
                disabled={!arquivo || importando}
                loading={importando}
              >
                {importando ? 'Importando...' : 'Importar Dados'}
              </Button>

              {arquivo && (
                <Button
                  variant="secondary"
                  onClick={handleLimpar}
                  disabled={importando}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Resultado */}
        {resultado && (
          <Card
            title={resultado.success ? '✅ Importação Concluída' : '❌ Erro na Importação'}
            variant={resultado.success ? 'success' : 'danger'}
          >
            <div className="space-y-4">
              {resultado.error ? (
                <p className="text-error-700">{resultado.error}</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-blue-50 p-4 rounded">
                      <div className="text-2xl font-bold text-blue-600">{resultado.total}</div>
                      <div className="text-sm text-blue-700">Total de Linhas</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded">
                      <div className="text-2xl font-bold text-green-600">{resultado.sucesso}</div>
                      <div className="text-sm text-green-700">Importados</div>
                    </div>
                    <div className="bg-red-50 p-4 rounded">
                      <div className="text-2xl font-bold text-red-600">{resultado.erro}</div>
                      <div className="text-sm text-red-700">Erros</div>
                    </div>
                  </div>

                  {resultado.avisos && resultado.avisos.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <h4 className="font-semibold text-yellow-800 mb-2">⚠️ Avisos:</h4>
                      <ul className="text-sm text-yellow-700 space-y-1 list-disc ml-4">
                        {resultado.avisos.map((aviso, idx) => (
                          <li key={idx}>{aviso}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {resultado.erros && resultado.erros.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded p-4">
                      <h4 className="font-semibold text-red-800 mb-2">❌ Erros:</h4>
                      <ul className="text-sm text-red-700 space-y-1 list-disc ml-4">
                        {resultado.erros.map((erro, idx) => (
                          <li key={idx}>{erro}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        )}

        {/* Template de Exemplo */}
        <Card title="📄 Exemplo de Dados">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Registro</th>
                  <th className="px-4 py-2 text-left font-semibold">Area</th>
                  <th className="px-4 py-2 text-left font-semibold">Valor_Previsto</th>
                  <th className="px-4 py-2 text-left font-semibold">Valor_Realizado</th>
                  <th className="px-4 py-2 text-left font-semibold">Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-2">28/02/2025</td>
                  <td className="px-4 py-2">SALDO INICIAL APLICAÇÃO</td>
                  <td className="px-4 py-2">0</td>
                  <td className="px-4 py-2">4777842.88</td>
                  <td className="px-4 py-2">Ajuste de Saldo de Aplicação</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-4 py-2">20/03/2025</td>
                  <td className="px-4 py-2">GASTO COM MATERIAL E CONSUMO</td>
                  <td className="px-4 py-2">142616.69</td>
                  <td className="px-4 py-2">0</td>
                  <td className="px-4 py-2">Previsão por Área</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">20/03/2025</td>
                  <td className="px-4 py-2">GASTO COM MATERIAL E CONSUMO</td>
                  <td className="px-4 py-2">0</td>
                  <td className="px-4 py-2">152385.68</td>
                  <td className="px-4 py-2">Pagamentos por Área</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-4 py-2">20/03/2025</td>
                  <td className="px-4 py-2">RECEITAS EM TITULOS</td>
                  <td className="px-4 py-2">377856.93</td>
                  <td className="px-4 py-2">0</td>
                  <td className="px-4 py-2">Previsão de Receitas</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
