/**
 * Script de Importação de Dados Históricos
 *
 * Este script importa dados de planilhas Excel para o banco Supabase
 *
 * INSTALAÇÃO:
 * npm install xlsx @supabase/supabase-js dotenv
 *
 * USO:
 * 1. Coloque suas planilhas na pasta /scripts/planilhas/
 * 2. Configure as variáveis de ambiente no arquivo .env
 * 3. Execute: npx tsx scripts/importar-dados.ts
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Mapeamento de áreas para IDs do banco
const AREAS_MAP: Record<string, number> = {
  'GASTO COM MATERIAL E CONSUMO': 1,
  'MATERIAL E CONSUMO': 1,
  'GASTO RH': 2,
  'RH': 2,
  'GASTO FINANCEIRO E FISCAL': 3,
  'FINANCEIRO E FISCAL': 3,
  'GASTO LOGISTICA': 4,
  'LOGISTICA': 4,
  'GASTO COMERCIAL': 5,
  'COMERCIAL': 5,
  'GASTO MARKETING': 6,
  'MARKETING': 6,
  'GASTO LOJA DE FABRICA': 7,
  'LOJA DE FABRICA': 7,
  'GASTO TI': 8,
  'TI': 8,
  'GASTO DIRETORIA': 9,
  'DIRETORIA': 9,
  'GASTO COMPRAS': 10,
  'COMPRAS': 10,
  'GASTO INVESTIMENTO': 11,
  'INVESTIMENTO': 11,
  'GASTO DALLAS': 12,
  'DALLAS': 12,
  'TRANSFERÊNCIA PARA APLICAÇÃO': 13,
  'TRANSFERENCIA PARA APLICACAO': 13,
  'APLICACAO': 13,
};

function normalizarNome(nome: string): string {
  return nome.trim().toUpperCase();
}

function obterIdArea(nomeArea: string): number | null {
  const normalizado = normalizarNome(nomeArea);

  // Procura exata
  if (AREAS_MAP[normalizado]) {
    return AREAS_MAP[normalizado];
  }

  // Procura parcial
  for (const [chave, id] of Object.entries(AREAS_MAP)) {
    if (normalizado.includes(chave) || chave.includes(normalizado)) {
      return id;
    }
  }

  console.warn(`⚠️  Área não encontrada: ${nomeArea}`);
  return null;
}

function converterData(data: any): string | null {
  if (!data) return null;

  // Se já é uma string no formato YYYY-MM-DD
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data;
  }

  // Se é um número de data do Excel
  if (typeof data === 'number') {
    const date = XLSX.SSF.parse_date_code(data);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }

  // Tenta converter string DD/MM/YYYY
  if (typeof data === 'string') {
    const match = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const [_, dia, mes, ano] = match;
      return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
  }

  console.warn(`⚠️  Formato de data não reconhecido: ${data}`);
  return null;
}

function converterValor(valor: any): number {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    // Remove R$, espaços, pontos (milhares) e troca vírgula por ponto
    const limpo = valor.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(limpo) || 0;
  }
  return 0;
}

async function importarMovimentacaoDiaria(caminhoArquivo: string) {
  console.log('\n📊 Importando Movimentação Diária...');

  const workbook = XLSX.readFile(caminhoArquivo);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const dados = XLSX.utils.sheet_to_json(worksheet);

  let sucesso = 0;
  let erro = 0;

  for (const linha of dados as any[]) {
    const data = converterData(linha['Registro'] || linha['data'] || linha['Data']);
    if (!data) {
      console.error('❌ Linha sem data:', linha);
      erro++;
      continue;
    }

    const area = linha['Area'] || linha['Área'] || linha['area'];
    const valorPrev = converterValor(linha['Valor_Prev'] || linha['valorPrev'] || 0);
    const valorReal = converterValor(linha['Valor_Realizado'] || linha['valorRealizado'] || 0);
    const origem = linha['Origem'] || linha['origem'] || '';

    try {
      // Identifica o tipo de registro
      const areaId = obterIdArea(area);

      if (areaId && origem.toLowerCase().includes('área')) {
        // Importa como pagamento por área
        if (valorPrev > 0) {
          await supabase.from('pvi_previsao_itens').insert({
            pvi_data: data,
            pvi_are_id: areaId,
            pvi_valor: valorPrev,
            pvi_tipo: 'pagamento',
          });
        }

        if (valorReal > 0) {
          await supabase.from('pag_pagamentos_area').insert({
            pag_data: data,
            pag_are_id: areaId,
            pag_valor: valorReal,
          });
        }

        sucesso++;
      }
      // Adicione lógica para outros tipos de registros (receitas, bancos, etc)

    } catch (err) {
      console.error(`❌ Erro ao importar linha:`, err);
      erro++;
    }
  }

  console.log(`✅ Importação concluída: ${sucesso} registros inseridos, ${erro} erros`);
}

async function importarSaldoInicial(caminhoArquivo: string) {
  console.log('\n💰 Importando Saldo Inicial...');

  const workbook = XLSX.readFile(caminhoArquivo);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const dados = XLSX.utils.sheet_to_json(worksheet);

  let sucesso = 0;
  let erro = 0;

  for (const linha of dados as any[]) {
    const data = converterData(linha['data de registro'] || linha['data'] || linha['Data']);
    if (!data) continue;

    const saldoInicial = converterValor(linha['saldoinicial'] || linha['saldoInicial'] || linha['Saldo Inicial'] || 0);
    const saldoFinal = converterValor(linha['saldoFinal'] || linha['Saldo Final'] || 0);

    try {
      if (saldoInicial > 0) {
        await supabase.from('pvi_previsao_itens').insert({
          pvi_data: data,
          pvi_valor: saldoInicial,
          pvi_tipo: 'saldo_inicial',
        });
      }

      if (saldoFinal > 0) {
        await supabase.from('pvi_previsao_itens').insert({
          pvi_data: data,
          pvi_valor: saldoFinal,
          pvi_tipo: 'saldo_final',
        });
      }

      sucesso++;
    } catch (err) {
      console.error(`❌ Erro ao importar saldo:`, err);
      erro++;
    }
  }

  console.log(`✅ Saldo inicial importado: ${sucesso} registros, ${erro} erros`);
}

async function main() {
  console.log('🚀 Iniciando importação de dados...\n');

  const pastaPlanilhas = path.join(__dirname, 'planilhas');

  if (!fs.existsSync(pastaPlanilhas)) {
    console.error('❌ Pasta /scripts/planilhas/ não encontrada!');
    console.log('📁 Crie a pasta e coloque suas planilhas Excel lá.');
    process.exit(1);
  }

  const arquivos = fs.readdirSync(pastaPlanilhas).filter(f =>
    f.endsWith('.xlsx') || f.endsWith('.xls')
  );

  if (arquivos.length === 0) {
    console.error('❌ Nenhuma planilha encontrada na pasta /scripts/planilhas/');
    process.exit(1);
  }

  console.log(`📁 Encontradas ${arquivos.length} planilhas:\n`);
  arquivos.forEach((arq, i) => console.log(`   ${i + 1}. ${arq}`));

  for (const arquivo of arquivos) {
    const caminhoCompleto = path.join(pastaPlanilhas, arquivo);

    if (arquivo.toLowerCase().includes('movimentacao') || arquivo.toLowerCase().includes('movimentação')) {
      await importarMovimentacaoDiaria(caminhoCompleto);
    } else if (arquivo.toLowerCase().includes('saldo')) {
      await importarSaldoInicial(caminhoCompleto);
    } else {
      console.log(`⚠️  Arquivo ignorado (nome não reconhecido): ${arquivo}`);
    }
  }

  console.log('\n✨ Importação finalizada!');
}

main().catch(console.error);
