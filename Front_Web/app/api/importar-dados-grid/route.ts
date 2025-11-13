import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer, getOrCreateUser } from '@/lib/supabaseClient';

type LinhaImportacao = {
  data: string;
  area: string;
  valorPrevisto: number;
  valorRealizado: number;
  tipoImportacao: string;
  mapeamentoId: number;
};

function converterData(data: string): string | null {
  if (!data) return null;

  // Se já é string no formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data;
  }

  // Tenta converter DD/MM/YYYY
  const match = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [_, dia, mes, ano] = match;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userName, linhas } = body as {
      userId: string;
      userName: string;
      linhas: LinhaImportacao[];
    };

    // Validações básicas
    if (!userId) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      );
    }

    if (userName?.toUpperCase() !== 'GENARO') {
      return NextResponse.json(
        { error: 'Apenas o usuário Genaro tem permissão' },
        { status: 403 }
      );
    }

    if (!linhas || linhas.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma linha para importar' },
        { status: 400 }
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

    let sucesso = 0;
    let erro = 0;
    const erros: string[] = [];

    // Processa cada linha
    for (const linha of linhas) {
      try {
        const data = converterData(linha.data);
        if (!data) {
          erros.push(`Data inválida: ${linha.data}`);
          erro++;
          continue;
        }

        const { tipoImportacao, mapeamentoId } = linha;

        // PAGAMENTO POR ÁREA (REALIZADO)
        if (tipoImportacao === 'pagamento_area') {
          if (linha.valorRealizado > 0) {
            const { error: insertError } = await supabase.from('pag_pagamentos_area').insert({
              pag_data: data,
              pag_are_id: mapeamentoId,
              pag_valor: linha.valorRealizado,
              pag_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          }
          continue;
        }

        // PREVISÃO POR ÁREA
        if (tipoImportacao === 'previsao_area') {
          if (linha.valorPrevisto > 0) {
            const { error: insertError } = await supabase.from('pvi_previsao_itens').insert({
              pvi_data: data,
              pvi_are_id: mapeamentoId,
              pvi_valor: linha.valorPrevisto,
              pvi_tipo: 'gasto',
              pvi_categoria: linha.area,
              pvi_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          }
          continue;
        }

        // SALDO POR BANCO
        if (tipoImportacao === 'saldo_banco') {
          if (linha.valorRealizado > 0) {
            const { error: insertError } = await supabase.from('pbk_pagamentos_banco').insert({
              pbk_data: data,
              pbk_ban_id: mapeamentoId,
              pbk_valor: linha.valorRealizado,
              pbk_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          }
          continue;
        }

        // RECEITA POR TIPO (REALIZADO)
        if (tipoImportacao === 'receita_tipo') {
          if (linha.valorRealizado > 0) {
            const { error: insertError } = await supabase.from('rec_receitas').insert({
              rec_data: data,
              rec_ctr_id: mapeamentoId,
              rec_valor: linha.valorRealizado,
              rec_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          }
          continue;
        }

        // PREVISÃO DE RECEITA
        if (tipoImportacao === 'previsao_receita') {
          if (linha.valorPrevisto > 0) {
            const { error: insertError } = await supabase.from('pvi_previsao_itens').insert({
              pvi_data: data,
              pvi_valor: linha.valorPrevisto,
              pvi_tipo: 'receita',
              pvi_categoria: linha.area,
              pvi_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          }
          continue;
        }

        erros.push(`Tipo de importação não reconhecido: ${tipoImportacao}`);
        erro++;

      } catch (err: any) {
        erros.push(`Erro na linha "${linha.area}": ${err.message}`);
        erro++;
      }
    }

    return NextResponse.json({
      success: true,
      sucesso,
      erro,
      total: linhas.length,
      erros: erros.slice(0, 10), // Limita a 10 erros
    });

  } catch (error: any) {
    console.error('Erro na importação:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao processar dados' },
      { status: 500 }
    );
  }
}
