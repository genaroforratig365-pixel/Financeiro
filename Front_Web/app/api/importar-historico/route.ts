import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseServer, getOrCreateUser } from '@/lib/supabaseClient';

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

// Mapeamento de bancos para IDs
const BANCOS_MAP: Record<string, number> = {
  'BANCO DO BRASIL': 1,
  'BB': 1,
  'BRADESCO': 2,
  'BANRISUL': 3,
  'CAIXA': 4,
  'CAIXA ECONOMICA': 4,
  'CAIXA ECONÔMICA': 4,
  'SANTANDER': 5,
  'ITAU': 6,
  'ITAÚ': 6,
  'SICOOB': 7,
  'SICREDI': 8,
};

// Mapeamento de tipos de receita para IDs de conta
const RECEITAS_MAP: Record<string, number> = {
  'RECEITAS EM TITULOS': 1, // Código 200
  'RECEITAS EM TÍTULOS': 1,
  'TITULOS': 1,
  'TÍTULOS': 1,
  'BOLETOS': 1,
  'RECEITAS EM DEPOSITOS': 2, // Código 201
  'RECEITAS EM DEPÓSITOS': 2,
  'DEPOSITOS': 2,
  'DEPÓSITOS': 2,
  'PIX': 2,
  'OUTRAS RECEITAS': 3, // Código 202
  'OUTRAS': 3,
  'RESGATE APLICAÇÃO': 3,
  'RESGATE APLICACAO': 3,
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

  return null;
}

function obterIdBanco(nomeBanco: string): number | null {
  const normalizado = normalizarNome(nomeBanco);

  // Procura exata
  if (BANCOS_MAP[normalizado]) {
    return BANCOS_MAP[normalizado];
  }

  // Procura parcial
  for (const [chave, id] of Object.entries(BANCOS_MAP)) {
    if (normalizado.includes(chave) || chave.includes(normalizado)) {
      return id;
    }
  }

  return null;
}

function obterIdContaReceita(tipoReceita: string): number | null {
  const normalizado = normalizarNome(tipoReceita);

  // Procura exata
  if (RECEITAS_MAP[normalizado]) {
    return RECEITAS_MAP[normalizado];
  }

  // Procura parcial
  for (const [chave, id] of Object.entries(RECEITAS_MAP)) {
    if (normalizado.includes(chave) || chave.includes(normalizado)) {
      return id;
    }
  }

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

export async function POST(request: NextRequest) {
  try {
    // Recebe o arquivo e dados do usuário
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;
    const userName = formData.get('userName') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'Nenhum arquivo enviado' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      );
    }

    // Verifica se o usuário é Genaro
    if (userName?.toUpperCase() !== 'GENARO') {
      return NextResponse.json(
        { error: 'Apenas o usuário Genaro tem permissão para importar dados' },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServer();

    // Obtém o usuário
    const { data: usuario, error: userError } = await getOrCreateUser(
      supabase,
      userId
    );

    if (userError || !usuario) {
      return NextResponse.json(
        { error: 'Erro ao obter usuário' },
        { status: 400 }
      );
    }

    // Lê o arquivo
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse com XLSX
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const dados = XLSX.utils.sheet_to_json(worksheet);

    let sucesso = 0;
    let erro = 0;
    const erros: string[] = [];
    const avisos: string[] = [];

    // Processa cada linha
    for (const linha of dados as any[]) {
      const data = converterData(linha['Registro'] || linha['data'] || linha['Data']);
      if (!data) {
        erros.push(`Linha sem data válida: ${JSON.stringify(linha)}`);
        erro++;
        continue;
      }

      const area = linha['Area'] || linha['Área'] || linha['area'];
      const valorPrev = converterValor(linha['Valor_Previsto'] || linha['Valor_Prev'] || linha['valorPrev'] || 0);
      const valorReal = converterValor(linha['Valor_Realizado'] || linha['valorRealizado'] || 0);
      const origem = (linha['Origem'] || linha['origem'] || '').toLowerCase();

      try {
        // SALDO INICIAL
        if (origem.includes('ajuste') || origem.includes('saldo inicial')) {
          if (valorReal > 0) {
            const { error: insertError } = await supabase.from('pvi_previsao_itens').insert({
              pvi_data: data,
              pvi_valor: valorReal,
              pvi_tipo: 'saldo_inicial',
              pvi_categoria: area,
              pvi_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          }
          continue;
        }

        // PAGAMENTOS POR ÁREA - PREVISÃO
        if (origem.includes('previsão por área') || origem.includes('previsao por area')) {
          const areaId = obterIdArea(area);
          if (areaId && valorPrev > 0) {
            const { error: insertError } = await supabase.from('pvi_previsao_itens').insert({
              pvi_data: data,
              pvi_are_id: areaId,
              pvi_valor: valorPrev,
              pvi_tipo: 'gasto',
              pvi_categoria: area,
              pvi_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          } else if (!areaId) {
            avisos.push(`Área não encontrada: ${area}`);
          }
          continue;
        }

        // PAGAMENTOS POR ÁREA - REALIZADO
        if (origem.includes('pagamentos por área') || origem.includes('pagamentos por area')) {
          const areaId = obterIdArea(area);
          if (areaId && valorReal > 0) {
            const { error: insertError } = await supabase.from('pag_pagamentos_area').insert({
              pag_data: data,
              pag_are_id: areaId,
              pag_valor: valorReal,
              pag_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          } else if (!areaId) {
            avisos.push(`Área não encontrada: ${area}`);
          }
          continue;
        }

        // RECEITAS - PREVISÃO
        if (origem.includes('previsão de receitas') || origem.includes('previsao de receitas')) {
          if (valorPrev > 0) {
            const { error: insertError } = await supabase.from('pvi_previsao_itens').insert({
              pvi_data: data,
              pvi_valor: valorPrev,
              pvi_tipo: 'receita',
              pvi_categoria: area,
              pvi_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          }
          continue;
        }

        // RECEITAS POR TIPO - REALIZADO
        if (origem.includes('receitas por tipo')) {
          const contaId = obterIdContaReceita(area);
          if (contaId && valorReal > 0) {
            const { error: insertError } = await supabase.from('rec_receitas').insert({
              rec_data: data,
              rec_ctr_id: contaId,
              rec_valor: valorReal,
              rec_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          } else if (!contaId) {
            avisos.push(`Tipo de receita não encontrado: ${area}`);
          }
          continue;
        }

        // SALDOS BANCÁRIOS
        if (origem.includes('saldo por banco')) {
          const bancoId = obterIdBanco(area);
          if (bancoId && valorReal > 0) {
            const { error: insertError } = await supabase.from('sdb_saldo_banco').insert({
              sdb_data: data,
              sdb_ban_id: bancoId,
              sdb_saldo: valorReal,
              sdb_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          } else if (!bancoId) {
            avisos.push(`Banco não encontrado: ${area}`);
          }
          continue;
        }

        // PAGAMENTOS POR BANCO
        if (origem.includes('pagamento por banco')) {
          const bancoId = obterIdBanco(area);
          if (bancoId && valorReal > 0) {
            const { error: insertError } = await supabase.from('pbk_pagamentos_banco').insert({
              pbk_data: data,
              pbk_ban_id: bancoId,
              pbk_valor: valorReal,
              pbk_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          } else if (!bancoId) {
            avisos.push(`Banco não encontrado: ${area}`);
          }
          continue;
        }

        avisos.push(`Origem não reconhecida: ${origem} - ${data}`);

      } catch (err: any) {
        erros.push(`Erro ao importar linha (${data}, ${area}): ${err.message}`);
        erro++;
      }
    }

    return NextResponse.json({
      success: true,
      sucesso,
      erro,
      total: dados.length,
      erros: erros.slice(0, 10), // Limita a 10 erros
      avisos: avisos.slice(0, 10), // Limita a 10 avisos
    });

  } catch (error: any) {
    console.error('Erro na importação:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao processar arquivo' },
      { status: 500 }
    );
  }
}
