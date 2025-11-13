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
        console.log(`[DEBUG] Linha recebida:`, JSON.stringify(linha));
        const data = converterData(linha.data);
        if (!data) {
          erros.push(`Data inválida: "${linha.data}" (tipo: ${typeof linha.data})`);
          erro++;
          continue;
        }

        const { tipoImportacao, mapeamentoId } = linha;

        console.log(`[IMPORT] Processando linha: tipo=${tipoImportacao}, mapeamentoId=${mapeamentoId}, valor=${linha.valorRealizado || linha.valorPrevisto}`);

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
            // Calcular início e fim da semana (segunda a sexta)
            const dataObj = new Date(data);
            const diaSemana = dataObj.getDay(); // 0=domingo, 1=segunda, ..., 6=sábado
            const diasAteSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
            const diasAteSexta = diaSemana === 0 ? -2 : 5 - diaSemana;

            const segundaFeira = new Date(dataObj);
            segundaFeira.setDate(dataObj.getDate() + diasAteSegunda);
            const pvs_semana_inicio = segundaFeira.toISOString().split('T')[0];

            const sextaFeira = new Date(dataObj);
            sextaFeira.setDate(dataObj.getDate() + diasAteSexta);
            const pvs_semana_fim = sextaFeira.toISOString().split('T')[0];

            // Buscar ou criar semana
            let { data: semanaExistente, error: semanaSelectError } = await supabase
              .from('pvs_semanas')
              .select('pvs_id')
              .eq('pvs_usr_id', usuario.usr_id)
              .eq('pvs_semana_inicio', pvs_semana_inicio)
              .single();

            let pvs_id: number;

            if (semanaSelectError || !semanaExistente) {
              // Criar nova semana
              const { data: novaSemana, error: semanaInsertError } = await supabase
                .from('pvs_semanas')
                .insert({
                  pvs_usr_id: usuario.usr_id,
                  pvs_semana_inicio,
                  pvs_semana_fim,
                  pvs_status: 'importado',
                  pvs_observacao: 'Criado automaticamente via importação',
                })
                .select('pvs_id')
                .single();

              if (semanaInsertError || !novaSemana) throw semanaInsertError;
              pvs_id = novaSemana.pvs_id;
            } else {
              pvs_id = semanaExistente.pvs_id;
            }

            // Inserir item de previsão
            const { error: insertError } = await supabase.from('pvi_previsao_itens').insert({
              pvi_pvs_id: pvs_id,
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
            const { error: insertError } = await supabase.from('sdb_saldo_banco').insert({
              sdb_data: data,
              sdb_ban_id: mapeamentoId,
              sdb_saldo: linha.valorRealizado,
              sdb_usr_id: usuario.usr_id,
            });
            if (insertError) throw insertError;
            sucesso++;
          }
          continue;
        }

        // PAGAMENTO POR BANCO
        if (tipoImportacao === 'pagamento_banco') {
          console.log(`[PAGAMENTO_BANCO] Processando: valor=${linha.valorRealizado}, banco=${mapeamentoId}`);
          if (linha.valorRealizado > 0) {
            const registro = {
              pbk_data: data,
              pbk_ban_id: mapeamentoId,
              pbk_valor: linha.valorRealizado,
              pbk_usr_id: usuario.usr_id,
            };
            console.log(`[PAGAMENTO_BANCO] Inserindo:`, registro);
            const { error: insertError } = await supabase.from('pbk_pagamentos_banco').insert(registro);
            if (insertError) {
              console.error(`[PAGAMENTO_BANCO] Erro:`, insertError);
              throw insertError;
            }
            console.log(`[PAGAMENTO_BANCO] Sucesso!`);
            sucesso++;
          } else {
            console.log(`[PAGAMENTO_BANCO] Valor zero ou negativo, pulando`);
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
            // Calcular início e fim da semana (segunda a sexta)
            const dataObj = new Date(data);
            const diaSemana = dataObj.getDay(); // 0=domingo, 1=segunda, ..., 6=sábado
            const diasAteSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
            const diasAteSexta = diaSemana === 0 ? -2 : 5 - diaSemana;

            const segundaFeira = new Date(dataObj);
            segundaFeira.setDate(dataObj.getDate() + diasAteSegunda);
            const pvs_semana_inicio = segundaFeira.toISOString().split('T')[0];

            const sextaFeira = new Date(dataObj);
            sextaFeira.setDate(dataObj.getDate() + diasAteSexta);
            const pvs_semana_fim = sextaFeira.toISOString().split('T')[0];

            // Buscar ou criar semana
            let { data: semanaExistente, error: semanaSelectError } = await supabase
              .from('pvs_semanas')
              .select('pvs_id')
              .eq('pvs_usr_id', usuario.usr_id)
              .eq('pvs_semana_inicio', pvs_semana_inicio)
              .single();

            let pvs_id: number;

            if (semanaSelectError || !semanaExistente) {
              // Criar nova semana
              const { data: novaSemana, error: semanaInsertError } = await supabase
                .from('pvs_semanas')
                .insert({
                  pvs_usr_id: usuario.usr_id,
                  pvs_semana_inicio,
                  pvs_semana_fim,
                  pvs_status: 'importado',
                  pvs_observacao: 'Criado automaticamente via importação',
                })
                .select('pvs_id')
                .single();

              if (semanaInsertError || !novaSemana) throw semanaInsertError;
              pvs_id = novaSemana.pvs_id;
            } else {
              pvs_id = semanaExistente.pvs_id;
            }

            // Inserir item de previsão
            const { error: insertError } = await supabase.from('pvi_previsao_itens').insert({
              pvi_pvs_id: pvs_id,
              pvi_data: data,
              pvi_valor: linha.valorPrevisto,
              pvi_tipo: 'receita',
              pvi_categoria: linha.area,
              pvi_tpr_id: mapeamentoId, // ID do tipo de receita
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
