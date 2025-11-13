'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Header } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { getUserSession } from '@/lib/userSession';

type LinhaArquivo = {
  id: string;
  Registro: string;
  Area: string;
  Valor_Previsto: number;
  Valor_Realizado: number;
  Origem: string;
  // Campos de configuração
  tipoImportacao: string;
  mapeamentoId: number | null;
  incluir: boolean;
  status?: 'pendente' | 'sucesso' | 'erro';
  mensagemErro?: string;
};

type OpcaoMapeamento = {
  id: number;
  nome: string;
};

// Opções de tipos de importação
const TIPOS_IMPORTACAO = [
  { value: '', label: '-- Selecione --' },
  { value: 'pagamento_area', label: 'Pagamento por Área (Realizado)' },
  { value: 'previsao_area', label: 'Previsão por Área' },
  { value: 'saldo_banco', label: 'Saldo por Banco' },
  { value: 'receita_tipo', label: 'Receita por Tipo (Realizado)' },
  { value: 'previsao_receita', label: 'Previsão de Receita' },
];

// Mapeamentos disponíveis
const AREAS: OpcaoMapeamento[] = [
  { id: 1, nome: 'Material e Consumo' },
  { id: 2, nome: 'RH' },
  { id: 3, nome: 'Financeiro e Fiscal' },
  { id: 4, nome: 'Logística' },
  { id: 5, nome: 'Comercial' },
  { id: 6, nome: 'Marketing' },
  { id: 7, nome: 'Loja de Fábrica' },
  { id: 8, nome: 'TI' },
  { id: 9, nome: 'Diretoria' },
  { id: 10, nome: 'Compras' },
  { id: 11, nome: 'Investimento' },
  { id: 12, nome: 'Dallas' },
  { id: 13, nome: 'Aplicação' },
];

const BANCOS: OpcaoMapeamento[] = [
  { id: 3, nome: 'Banrisul' },
  { id: 4, nome: 'Banco do Brasil' },
  { id: 5, nome: 'Bradesco' },
  { id: 8, nome: 'Sicredi' },
];

const TIPOS_RECEITA: OpcaoMapeamento[] = [
  { id: 1, nome: 'Receitas em Títulos/Boletos' },
  { id: 2, nome: 'Receitas em Depósitos/PIX' },
  { id: 3, nome: 'Outras Receitas' },
];

export default function ImportarDadosGrid() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<LinhaArquivo[]>([]);
  const [processando, setProcessando] = useState(false);
  const [importando, setImportando] = useState(false);
  const session = getUserSession();

  const handleArquivoSelecionado = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setArquivo(file);
    setProcessando(true);

    try {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const dados = XLSX.utils.sheet_to_json(worksheet) as any[];

      const linhasProcessadas: LinhaArquivo[] = dados.map((linha, index) => ({
        id: `linha-${index}`,
        Registro: linha.Registro || linha.data || linha.Data || '',
        Area: linha.Area || linha.Área || linha.area || '',
        Valor_Previsto: Number(linha.Valor_Previsto || linha.valorPrev || 0),
        Valor_Realizado: Number(linha.Valor_Realizado || linha.valorRealizado || 0),
        Origem: linha.Origem || linha.origem || '',
        tipoImportacao: '',
        mapeamentoId: null,
        incluir: true,
      }));

      setLinhas(linhasProcessadas);
    } catch (error) {
      alert('Erro ao ler arquivo: ' + (error as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const handleTipoChange = (id: string, tipo: string) => {
    setLinhas(prev => prev.map(linha =>
      linha.id === id ? { ...linha, tipoImportacao: tipo, mapeamentoId: null } : linha
    ));
  };

  const handleMapeamentoChange = (id: string, mapeamentoId: number) => {
    setLinhas(prev => prev.map(linha =>
      linha.id === id ? { ...linha, mapeamentoId } : linha
    ));
  };

  const handleIncluirChange = (id: string, incluir: boolean) => {
    setLinhas(prev => prev.map(linha =>
      linha.id === id ? { ...linha, incluir } : linha
    ));
  };

  const handleSelecionarTodos = (incluir: boolean) => {
    setLinhas(prev => prev.map(linha => ({ ...linha, incluir })));
  };

  const handleAplicarEmLote = () => {
    const tipoSelecionado = prompt('Digite o tipo de importação para todas as linhas selecionadas:\n\n1 = Pagamento por Área\n2 = Previsão por Área\n3 = Saldo por Banco\n4 = Receita por Tipo\n5 = Previsão de Receita');

    if (!tipoSelecionado) return;

    const mapa: Record<string, string> = {
      '1': 'pagamento_area',
      '2': 'previsao_area',
      '3': 'saldo_banco',
      '4': 'receita_tipo',
      '5': 'previsao_receita',
    };

    const tipo = mapa[tipoSelecionado];
    if (!tipo) {
      alert('Opção inválida!');
      return;
    }

    setLinhas(prev => prev.map(linha =>
      linha.incluir ? { ...linha, tipoImportacao: tipo } : linha
    ));
  };

  const obterOpcoesMapeamento = (tipo: string): OpcaoMapeamento[] => {
    if (tipo === 'pagamento_area' || tipo === 'previsao_area') return AREAS;
    if (tipo === 'saldo_banco') return BANCOS;
    if (tipo === 'receita_tipo' || tipo === 'previsao_receita') return TIPOS_RECEITA;
    return [];
  };

  const validarLinhas = (): boolean => {
    const linhasIncluidas = linhas.filter(l => l.incluir);

    if (linhasIncluidas.length === 0) {
      alert('Selecione pelo menos uma linha para importar!');
      return false;
    }

    for (const linha of linhasIncluidas) {
      if (!linha.tipoImportacao) {
        alert(`Linha "${linha.Area}" sem tipo de importação!`);
        return false;
      }
      if (linha.mapeamentoId === null) {
        alert(`Linha "${linha.Area}" sem mapeamento configurado!`);
        return false;
      }
    }

    return true;
  };

  const handleImportar = async () => {
    if (!validarLinhas()) return;

    if (!confirm(`Confirma a importação de ${linhas.filter(l => l.incluir).length} linhas?`)) {
      return;
    }

    setImportando(true);

    try {
      const linhasParaImportar = linhas.filter(l => l.incluir).map(l => ({
        data: l.Registro,
        area: l.Area,
        valorPrevisto: l.Valor_Previsto,
        valorRealizado: l.Valor_Realizado,
        tipoImportacao: l.tipoImportacao,
        mapeamentoId: l.mapeamentoId,
      }));

      const response = await fetch('/api/importar-dados-grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.userId,
          userName: session.userName,
          linhas: linhasParaImportar,
        }),
      });

      const resultado = await response.json();

      if (!response.ok) {
        throw new Error(resultado.error || 'Erro ao importar');
      }

      alert(`✅ Importação concluída!\n\nSucesso: ${resultado.sucesso}\nErros: ${resultado.erro}`);

      // Limpa o formulário
      setArquivo(null);
      setLinhas([]);
      const input = document.getElementById('file-input') as HTMLInputElement;
      if (input) input.value = '';

    } catch (error: any) {
      alert('❌ Erro: ' + error.message);
    } finally {
      setImportando(false);
    }
  };

  return (
    <>
      <Header
        title="Importar Dados - Grid Interativa"
        subtitle="Configure visualmente o que será importado"
      />

      <div className="page-content space-y-6">
        {/* Aviso de Permissão */}
        {session.userName?.toUpperCase() !== 'GENARO' && (
          <Card title="⚠️ Permissão Necessária" variant="danger">
            <p className="text-error-700">
              Apenas o usuário <strong>Genaro</strong> pode importar dados.
            </p>
          </Card>
        )}

        {/* Upload de Arquivo */}
        <Card title="1️⃣ Selecionar Arquivo Excel">
          <div className="space-y-4">
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleArquivoSelecionado}
              disabled={processando || session.userName?.toUpperCase() !== 'GENARO'}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer disabled:opacity-50"
            />
            {arquivo && (
              <p className="text-sm text-gray-600">
                ✅ <strong>{arquivo.name}</strong> - {linhas.length} linhas carregadas
              </p>
            )}
          </div>
        </Card>

        {/* Grid de Configuração */}
        {linhas.length > 0 && (
          <Card title="2️⃣ Configurar Importação">
            <div className="space-y-4">
              {/* Ações em Lote */}
              <div className="flex gap-3 pb-4 border-b">
                <Button
                  variant="secondary"
                  onClick={() => handleSelecionarTodos(true)}
                >
                  ✓ Marcar Todos
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleSelecionarTodos(false)}
                >
                  ✗ Desmarcar Todos
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAplicarEmLote}
                >
                  ⚡ Aplicar Tipo em Lote
                </Button>
              </div>

              {/* Tabela de Dados */}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border p-2 w-12">✓</th>
                      <th className="border p-2">Data</th>
                      <th className="border p-2">Área/Banco/Tipo</th>
                      <th className="border p-2">Previsto</th>
                      <th className="border p-2">Realizado</th>
                      <th className="border p-2 w-56">Tipo de Importação</th>
                      <th className="border p-2 w-56">Mapear Para</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((linha) => (
                      <tr key={linha.id} className={linha.incluir ? 'bg-white' : 'bg-gray-50 opacity-50'}>
                        <td className="border p-2 text-center">
                          <input
                            type="checkbox"
                            checked={linha.incluir}
                            onChange={(e) => handleIncluirChange(linha.id, e.target.checked)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="border p-2">{linha.Registro}</td>
                        <td className="border p-2 font-medium">{linha.Area}</td>
                        <td className="border p-2 text-right">
                          {linha.Valor_Previsto > 0 ? linha.Valor_Previsto.toFixed(2) : '-'}
                        </td>
                        <td className="border p-2 text-right">
                          {linha.Valor_Realizado > 0 ? linha.Valor_Realizado.toFixed(2) : '-'}
                        </td>
                        <td className="border p-2">
                          <select
                            value={linha.tipoImportacao}
                            onChange={(e) => handleTipoChange(linha.id, e.target.value)}
                            disabled={!linha.incluir}
                            className="w-full border rounded px-2 py-1 text-xs"
                          >
                            {TIPOS_IMPORTACAO.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="border p-2">
                          {linha.tipoImportacao && (
                            <select
                              value={linha.mapeamentoId || ''}
                              onChange={(e) => handleMapeamentoChange(linha.id, Number(e.target.value))}
                              disabled={!linha.incluir}
                              className="w-full border rounded px-2 py-1 text-xs"
                            >
                              <option value="">-- Selecione --</option>
                              {obterOpcoesMapeamento(linha.tipoImportacao).map(opt => (
                                <option key={opt.id} value={opt.id}>
                                  [{opt.id}] {opt.nome}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Resumo */}
              <div className="bg-blue-50 p-4 rounded">
                <p className="text-sm font-semibold text-blue-900">
                  📊 Resumo: {linhas.filter(l => l.incluir).length} linhas selecionadas para importação
                </p>
              </div>

              {/* Botão de Importar */}
              <div className="flex justify-end pt-4 border-t">
                <Button
                  variant="primary"
                  onClick={handleImportar}
                  disabled={importando || linhas.filter(l => l.incluir).length === 0 || session.userName?.toUpperCase() !== 'GENARO'}
                  loading={importando}
                >
                  {importando ? 'Importando...' : '✅ Confirmar e Importar'}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
