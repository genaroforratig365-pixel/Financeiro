'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Header } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { ConfirmModal } from '@/components/ui/Modal';
import Toast from '@/components/ui/Toast';
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
  { value: 'pagamento_banco', label: 'Pagamento por Banco' },
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

  // Estados para Toast e Modal
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Estado para aplicação em lote de mapeamento
  const [mapeamentoEmLote, setMapeamentoEmLote] = useState<number | ''>('');

  // Função para converter data do Excel para DD/MM/YYYY
  const converterDataExcel = (data: any): string => {
    if (!data) return '';

    // Se já é string no formato correto
    if (typeof data === 'string' && data.includes('/')) {
      return data;
    }

    // Se é número (serial do Excel)
    if (typeof data === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const msPerDay = 86400000;
      const date = new Date(excelEpoch.getTime() + data * msPerDay);
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const ano = date.getFullYear();
      return `${dia}/${mes}/${ano}`;
    }

    return String(data);
  };

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

      const linhasProcessadas: LinhaArquivo[] = dados.map((linha, index) => {
        const dataRaw = linha.Registro || linha.data || linha.Data || '';
        return {
          id: `linha-${index}`,
          Registro: converterDataExcel(dataRaw),
          Area: linha.Area || linha.Área || linha.area || '',
          Valor_Previsto: Number(linha.Valor_Previsto || linha.valorPrev || 0),
          Valor_Realizado: Number(linha.Valor_Realizado || linha.valorRealizado || 0),
          Origem: linha.Origem || linha.origem || '',
          tipoImportacao: '',
          mapeamentoId: null,
          incluir: true,
        };
      });

      setLinhas(linhasProcessadas);
    } catch (error) {
      setToast({ message: 'Erro ao ler arquivo: ' + (error as Error).message, type: 'error' });
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

  const [tipoEmLote, setTipoEmLote] = useState('');

  const handleAplicarTipoEmLote = () => {
    if (!tipoEmLote) {
      setToast({ message: 'Selecione um tipo de importação primeiro!', type: 'warning' });
      return;
    }

    const linhasSelecionadas = linhas.filter(l => l.incluir).length;
    if (linhasSelecionadas === 0) {
      setToast({ message: 'Selecione pelo menos uma linha primeiro!', type: 'warning' });
      return;
    }

    const tipoLabel = TIPOS_IMPORTACAO.find(t => t.value === tipoEmLote)?.label;

    setConfirmModal({
      isOpen: true,
      title: 'Aplicar Tipo em Lote',
      message: `Deseja aplicar "${tipoLabel}" em ${linhasSelecionadas} linhas selecionadas?`,
      onConfirm: () => {
        setLinhas(prev => prev.map(linha =>
          linha.incluir ? { ...linha, tipoImportacao: tipoEmLote, mapeamentoId: null } : linha
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setToast({ message: `Tipo aplicado em ${linhasSelecionadas} linhas com sucesso!`, type: 'success' });
      },
    });
  };

  const handleAplicarMapeamentoEmLote = () => {
    if (!mapeamentoEmLote) {
      setToast({ message: 'Selecione um mapeamento primeiro!', type: 'warning' });
      return;
    }

    const linhasSelecionadas = linhas.filter(l => l.incluir && l.tipoImportacao).length;
    if (linhasSelecionadas === 0) {
      setToast({ message: 'Selecione pelo menos uma linha com tipo definido!', type: 'warning' });
      return;
    }

    // Determinar qual tipo de mapeamento baseado na primeira linha selecionada
    const primeiraLinhaSelecionada = linhas.find(l => l.incluir && l.tipoImportacao);
    if (!primeiraLinhaSelecionada) return;

    const opcoes = obterOpcoesMapeamento(primeiraLinhaSelecionada.tipoImportacao);
    const mapeamentoNome = opcoes.find(o => o.id === mapeamentoEmLote)?.nome;

    setConfirmModal({
      isOpen: true,
      title: 'Aplicar Mapeamento em Lote',
      message: `Deseja aplicar o mapeamento "${mapeamentoNome}" em ${linhasSelecionadas} linhas selecionadas?`,
      onConfirm: () => {
        setLinhas(prev => prev.map(linha =>
          linha.incluir && linha.tipoImportacao ? { ...linha, mapeamentoId: Number(mapeamentoEmLote) } : linha
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setToast({ message: `Mapeamento aplicado em ${linhasSelecionadas} linhas com sucesso!`, type: 'success' });
      },
    });
  };

  const obterOpcoesMapeamento = (tipo: string): OpcaoMapeamento[] => {
    if (tipo === 'pagamento_area' || tipo === 'previsao_area') return AREAS;
    if (tipo === 'saldo_banco' || tipo === 'pagamento_banco') return BANCOS;
    if (tipo === 'receita_tipo' || tipo === 'previsao_receita') return TIPOS_RECEITA;
    return [];
  };

  const validarLinhas = (): string | null => {
    const linhasIncluidas = linhas.filter(l => l.incluir);

    if (linhasIncluidas.length === 0) {
      return 'Selecione pelo menos uma linha para importar!';
    }

    for (const linha of linhasIncluidas) {
      if (!linha.tipoImportacao) {
        return `Linha "${linha.Area}" sem tipo de importação!`;
      }
      if (linha.mapeamentoId === null) {
        return `Linha "${linha.Area}" sem mapeamento configurado!`;
      }
    }

    return null;
  };

  const iniciarImportacao = () => {
    const erro = validarLinhas();
    if (erro) {
      setToast({ message: erro, type: 'error' });
      return;
    }

    const qtdLinhas = linhas.filter(l => l.incluir).length;

    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Importação',
      message: `Deseja realmente importar ${qtdLinhas} linhas para o sistema? Esta ação não pode ser desfeita.`,
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        handleImportar();
      },
    });
  };

  const handleImportar = async () => {

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

      console.log('[IMPORTAÇÃO] Primeira linha a ser enviada:', linhasParaImportar[0]);
      console.log('[IMPORTAÇÃO] Total de linhas:', linhasParaImportar.length);

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

      // Mostrar erros detalhados se houver
      if (resultado.erros && resultado.erros.length > 0) {
        console.error('[IMPORTAÇÃO] Erros detalhados:', resultado.erros);
        setToast({
          message: `Importação concluída com erros! Sucesso: ${resultado.sucesso}, Erros: ${resultado.erro}. Primeiro erro: ${resultado.erros[0]}`,
          type: 'error'
        });
      } else {
        setToast({
          message: `Importação concluída! Sucesso: ${resultado.sucesso}, Erros: ${resultado.erro}`,
          type: resultado.erro > 0 ? 'warning' : 'success'
        });
      }

      // Limpa o formulário
      setArquivo(null);
      setLinhas([]);
      const input = document.getElementById('file-input') as HTMLInputElement;
      if (input) input.value = '';

    } catch (error: any) {
      setToast({ message: 'Erro ao importar: ' + error.message, type: 'error' });
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
              {/* Instruções */}
              <div className="bg-yellow-50 p-3 rounded text-sm">
                <p className="font-semibold text-yellow-900 mb-1">📋 Como configurar:</p>
                <ol className="list-decimal ml-5 text-yellow-800 space-y-1">
                  <li>Use &quot;Tipo em Lote&quot; para definir o tipo de importação para todas as linhas selecionadas</li>
                  <li>Use &quot;Mapeamento em Lote&quot; para aplicar o mapeamento em todas as linhas selecionadas</li>
                  <li>Ajuste configurações individuais se necessário usando os dropdowns de cada linha</li>
                  <li>Revise e clique em &quot;Confirmar e Importar&quot;</li>
                </ol>
              </div>

              {/* Ações em Lote */}
              <div className="pb-4 border-b space-y-3">
                <div className="flex gap-3">
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
                </div>

                <div className="flex gap-3 items-center bg-blue-50 p-3 rounded">
                  <label className="font-semibold text-sm text-blue-900 whitespace-nowrap">
                    ⚡ Tipo em Lote:
                  </label>
                  <select
                    value={tipoEmLote}
                    onChange={(e) => setTipoEmLote(e.target.value)}
                    className="flex-1 border rounded px-3 py-2 text-sm"
                  >
                    {TIPOS_IMPORTACAO.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <Button
                    variant="primary"
                    onClick={handleAplicarTipoEmLote}
                  >
                    ⚡ Aplicar Tipo
                  </Button>
                </div>

                <div className="flex gap-3 items-center bg-green-50 p-3 rounded">
                  <label className="font-semibold text-sm text-green-900 whitespace-nowrap">
                    🎯 Mapeamento em Lote:
                  </label>
                  <select
                    value={mapeamentoEmLote}
                    onChange={(e) => setMapeamentoEmLote(Number(e.target.value) || '')}
                    className="flex-1 border rounded px-3 py-2 text-sm"
                  >
                    <option value="">-- Selecione o mapeamento --</option>
                    {linhas.some(l => l.incluir && (l.tipoImportacao === 'pagamento_area' || l.tipoImportacao === 'previsao_area')) &&
                      AREAS.map(opt => (
                        <option key={opt.id} value={opt.id}>[{opt.id}] {opt.nome}</option>
                      ))
                    }
                    {linhas.some(l => l.incluir && (l.tipoImportacao === 'saldo_banco' || l.tipoImportacao === 'pagamento_banco')) &&
                      BANCOS.map(opt => (
                        <option key={opt.id} value={opt.id}>[{opt.id}] {opt.nome}</option>
                      ))
                    }
                    {linhas.some(l => l.incluir && (l.tipoImportacao === 'receita_tipo' || l.tipoImportacao === 'previsao_receita')) &&
                      TIPOS_RECEITA.map(opt => (
                        <option key={opt.id} value={opt.id}>[{opt.id}] {opt.nome}</option>
                      ))
                    }
                  </select>
                  <Button
                    variant="primary"
                    onClick={handleAplicarMapeamentoEmLote}
                  >
                    🎯 Aplicar Mapeamento
                  </Button>
                </div>
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
                          {linha.tipoImportacao ? (
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
                          ) : (
                            <span className="text-xs text-gray-400 italic">
                              Selecione o tipo primeiro
                            </span>
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
                  onClick={iniciarImportacao}
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

      {/* Toast de Notificações */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Modal de Confirmação */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Confirmar"
        cancelText="Cancelar"
      />
    </>
  );
}
