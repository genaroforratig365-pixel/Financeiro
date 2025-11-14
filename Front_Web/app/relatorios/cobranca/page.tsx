'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading, Modal, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import {
  getOrCreateUser,
  getSupabaseClient,
  type UsuarioRow,
} from '@/lib/supabaseClient';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';
import { getUserSession } from '@/lib/userSession';

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

type MaybeArray<T> = T | T[] | null | undefined;

type PrevisaoRow = {
  pvi_valor?: unknown;
  pvi_ctr_id?: unknown;
  pvi_ban_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_id?: unknown; tpr_nome?: unknown; tpr_codigo?: unknown } | null>;
};

type CobrancaRow = {
  cob_valor?: unknown;
  cob_ctr_id?: unknown;
  cob_ban_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_id?: unknown; tpr_nome?: unknown; tpr_codigo?: unknown } | null>;
};

type TipoResumo = {
  id: string;
  nome: string;
  previsto: number;
  realizado: number;
  diferenca: number;
  percentual: number;
};

type BancoResumo = {
  id: string;
  nome: string;
  previsto: number;
  realizado: number;
  diferenca: number;
  percentual: number;
  tipos: TipoResumo[];
};

type TipoValor = {
  tipoId: string;
  tipoNome: string;
  valor: number;
};

type CategoriaResumo = {
  tiposReceitaPrevista: TipoValor[];
  tiposOutrasReceitas: TipoValor[];
  totalReceitaPrevista: number;
  totalOutrasReceitas: number;
  total: number;
};

type BancoCategorizado = {
  id: string;
  nome: string;
  titulos: CategoriaResumo;
  depositos: CategoriaResumo;
};

type RelatorioCobranca = {
  data: string;
  bancos: BancoResumo[];
  bancosCategorizado: BancoCategorizado[];
  totais: {
    previsto: number;
    realizado: number;
    diferenca: number;
    titulosTotal: number;
    titulosTotalReceitaPrevista: number;
    titulosTotalOutrasReceitas: number;
    depositosTotal: number;
    depositosTotalReceitaPrevista: number;
    depositosTotalOutrasReceitas: number;
    percentualTitulos: number;
    percentualDepositos: number;
  };
};

const normalizeRelation = <T,>(value: MaybeArray<T>): Exclude<T, null | undefined>[] => {
  if (!value) {
    return [];
  }
  const arrayValue = Array.isArray(value) ? value : [value];
  return arrayValue.filter((item): item is Exclude<T, null | undefined> => item != null);
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
};

const construirChave = (id: number, nome: string, prefixo: string): string => {
  if (Number.isFinite(id) && id > 0) {
    return `${prefixo}-${id}`;
  }
  const base = nome.trim().toLowerCase().replace(/\s+/g, '-');
  return `${prefixo}-${base || 'nao-informado'}`;
};

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

const RelatorioCobrancaPage: React.FC = () => {
  const hoje = useMemo(() => new Date(), []);
  const [dataFiltro, setDataFiltro] = useState(() => toISODate(hoje));
  const [dataReferencia, setDataReferencia] = useState(() => toISODate(hoje));
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregandoUsuario, setCarregandoUsuario] = useState(true);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioCobranca | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [emailModalAberto, setEmailModalAberto] = useState(false);
  const [emailDestino, setEmailDestino] = useState('');
  const [emailMensagem, setEmailMensagem] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [feedbackEmail, setFeedbackEmail] = useState<string | null>(null);

  const carregarUsuario = useCallback(async () => {
    try {
      setCarregandoUsuario(true);
      const supabase = getSupabaseClient();
      const { userId, userName, userEmail } = getUserSession();
      const { data, error } = await getOrCreateUser(
        supabase,
        userId,
        userName ?? undefined,
        userEmail ?? undefined,
      );
      if (error) throw error;
      if (!data) {
        setErro('Não foi possível identificar o usuário autenticado.');
        return;
      }
      setUsuario(data);
      setErro(null);
    } catch (error) {
      console.error('Erro ao carregar usuário para o relatório de cobrança:', error);
      setErro(
        traduzirErroSupabase(
          error,
          'Não foi possível carregar as informações iniciais. Tente novamente mais tarde.',
        ),
      );
    } finally {
      setCarregandoUsuario(false);
    }
  }, []);

  useEffect(() => {
    carregarUsuario();
  }, [carregarUsuario]);

  const carregarRelatorio = useCallback(
    async (data: string) => {
      if (!usuario || !data) {
        return;
      }

      try {
        setCarregandoDados(true);
        const supabase = getSupabaseClient();

        // Buscar bancos primeiro para fazer o mapeamento manual
        const { data: bancosData, error: bancosError } = await supabase
          .from('ban_bancos')
          .select('ban_id, ban_nome, ban_codigo');

        if (bancosError) throw bancosError;

        const bancosMap = new Map<number, { nome: string; codigo: string }>();
        (bancosData || []).forEach((banco) => {
          bancosMap.set(banco.ban_id, { nome: banco.ban_nome, codigo: banco.ban_codigo || '' });
        });

        const [previsoesRes, cobrancasRes] = await Promise.all([
          supabase
            .from('pvi_previsao_itens')
            .select(
              'pvi_valor, pvi_ctr_id, pvi_ban_id, ctr_contas_receita(ctr_nome, ctr_codigo), tpr_tipos_receita(tpr_id, tpr_nome, tpr_codigo)',
            )
            .eq('pvi_tipo', 'receita')
            .eq('pvi_data', data),
          supabase
            .from('cob_cobrancas')
            .select('cob_valor, cob_ctr_id, cob_ban_id, ctr_contas_receita(ctr_nome, ctr_codigo), tpr_tipos_receita(tpr_id, tpr_nome, tpr_codigo)')
            .eq('cob_data', data),
        ]);

        if (previsoesRes.error) throw previsoesRes.error;
        if (cobrancasRes.error) throw cobrancasRes.error;

        const previsoes = normalizeRelation(previsoesRes.data as MaybeArray<PrevisaoRow>);
        const cobrancas = normalizeRelation(cobrancasRes.data as MaybeArray<CobrancaRow>);

        type ContaResumo = {
          chave: string;
          contaNome: string;
          contaCodigo: string;
          bancoId: string;
          bancoNome: string;
          tipoId: string;
          tipoNome: string;
          tipoCodigo: string;
          previsto: number;
          realizado: number;
        };

        const contasMap = new Map<string, ContaResumo>();

        previsoes.forEach((item) => {
          const valor = arredondar(toNumber(item.pvi_valor));
          if (valor === 0) {
            return;
          }

          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const contaNome = contaRel?.ctr_nome ? toString(contaRel.ctr_nome) : 'Conta não informada';
          const contaCodigo = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : '';
          const contaId = toNumber(item.pvi_ctr_id, 0);

          // IMPORTANTE: Usar pvi_ban_id diretamente e buscar no bancosMap
          const bancoIdNumero = toNumber(item.pvi_ban_id, NaN);
          const bancoInfo = Number.isFinite(bancoIdNumero) ? bancosMap.get(bancoIdNumero) : null;
          const bancoNome = bancoInfo?.nome || 'Banco não informado';
          const bancoChave = construirChave(bancoIdNumero, bancoNome, 'banco');

          const tipoRel = normalizeRelation(item.tpr_tipos_receita)[0];
          const tipoNome = tipoRel?.tpr_nome ? toString(tipoRel.tpr_nome) : contaNome;
          const tipoCodigo = tipoRel?.tpr_codigo ? toString(tipoRel.tpr_codigo) : '';
          const tipoIdNumero = toNumber(tipoRel?.tpr_id, NaN);
          const tipoChave = construirChave(tipoIdNumero, tipoNome, 'tipo');

          // CRÍTICO: Chave única deve ser banco + conta + tipo para não misturar bancos
          const chaveUnica = `${bancoChave}-${contaId}-${tipoChave}`;

          const existente = contasMap.get(chaveUnica) ?? {
            chave: chaveUnica,
            contaNome,
            contaCodigo,
            bancoId: bancoChave,
            bancoNome,
            tipoId: tipoChave,
            tipoNome,
            tipoCodigo,
            previsto: 0,
            realizado: 0,
          };

          existente.previsto += valor;
          contasMap.set(chaveUnica, existente);
        });

        cobrancas.forEach((item) => {
          const valor = arredondar(toNumber(item.cob_valor));
          if (valor === 0) {
            return;
          }

          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const contaNome = contaRel?.ctr_nome ? toString(contaRel.ctr_nome) : 'Conta não informada';
          const contaCodigo = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : '';
          const contaId = toNumber(item.cob_ctr_id, 0);

          // IMPORTANTE: Usar cob_ban_id diretamente e buscar no bancosMap
          const bancoIdNumero = toNumber(item.cob_ban_id, NaN);
          const bancoInfo = Number.isFinite(bancoIdNumero) ? bancosMap.get(bancoIdNumero) : null;
          const bancoNome = bancoInfo?.nome || 'Banco não informado';
          const bancoChave = construirChave(bancoIdNumero, bancoNome, 'banco');

          const tipoRel = normalizeRelation(item.tpr_tipos_receita)[0];
          const tipoNome = tipoRel?.tpr_nome ? toString(tipoRel.tpr_nome) : contaNome;
          const tipoCodigo = tipoRel?.tpr_codigo ? toString(tipoRel.tpr_codigo) : '';
          const tipoIdNumero = toNumber(tipoRel?.tpr_id, NaN);
          const tipoChave = construirChave(tipoIdNumero, tipoNome, 'tipo');

          // CRÍTICO: Chave única deve ser banco + conta + tipo para não misturar bancos
          const chaveUnica = `${bancoChave}-${contaId}-${tipoChave}`;

          const existente = contasMap.get(chaveUnica) ?? {
            chave: chaveUnica,
            contaNome,
            contaCodigo,
            bancoId: bancoChave,
            bancoNome,
            tipoId: tipoChave,
            tipoNome,
            tipoCodigo,
            previsto: 0,
            realizado: 0,
          };

          existente.realizado += valor;
          contasMap.set(chaveUnica, existente);
        });

        type BancoAcumulado = {
          nome: string;
          previsto: number;
          realizado: number;
          tipos: Map<string, { nome: string; previsto: number; realizado: number }>;
        };

        const bancosAcumuladosMap = new Map<string, BancoAcumulado>();

        contasMap.forEach((conta) => {
          if (conta.previsto === 0 && conta.realizado === 0) {
            return;
          }

          const banco = bancosAcumuladosMap.get(conta.bancoId) ?? {
            nome: conta.bancoNome,
            previsto: 0,
            realizado: 0,
            tipos: new Map(),
          };

          banco.nome = conta.bancoNome;
          banco.previsto += conta.previsto;
          banco.realizado += conta.realizado;

          const tipo = banco.tipos.get(conta.tipoId) ?? {
            nome: conta.tipoNome,
            previsto: 0,
            realizado: 0,
          };

          tipo.nome = conta.tipoNome;
          tipo.previsto += conta.previsto;
          tipo.realizado += conta.realizado;
          banco.tipos.set(conta.tipoId, tipo);
          bancosAcumuladosMap.set(conta.bancoId, banco);
        });

        const bancos: BancoResumo[] = Array.from(bancosAcumuladosMap.entries())
          .map(([id, banco]) => {
            const tipos: TipoResumo[] = Array.from(banco.tipos.entries())
              .map(([tipoId, tipo]) => {
                const previsto = arredondar(tipo.previsto);
                const realizado = arredondar(tipo.realizado);
                const diferenca = arredondar(realizado - previsto);
                const percentual = previsto > 0 ? arredondar((realizado / previsto) * 100) : 0;
                return {
                  id: `${id}-${tipoId}`,
                  nome: tipo.nome,
                  previsto,
                  realizado,
                  diferenca,
                  percentual,
                };
              })
              .filter((tipo) => tipo.realizado !== 0)
              .sort((a, b) => b.realizado - a.realizado);

            // Soma TODOS os tipos no comparativo (não apenas "prevista")
            const previsto = arredondar(banco.previsto);
            const realizado = arredondar(banco.realizado);
            const diferenca = arredondar(realizado - previsto);
            const percentual = previsto > 0 ? arredondar((realizado / previsto) * 100) : 0;

            return {
              id,
              nome: banco.nome,
              previsto,
              realizado,
              diferenca,
              percentual,
              tipos,
            };
          })
          .filter((banco) => banco.previsto !== 0 || banco.realizado !== 0)
          .sort((a, b) => b.realizado - a.realizado || a.nome.localeCompare(b.nome, 'pt-BR'));

        // Processar categorização por Títulos e Depósitos
        type BancoCategoriaAcumulado = {
          nome: string;
          titulosReceitaPrevista: Map<string, { tipoNome: string; valor: number }>;
          titulosOutrasReceitas: Map<string, { tipoNome: string; valor: number }>;
          depositosReceitaPrevista: Map<string, { tipoNome: string; valor: number }>;
          depositosOutrasReceitas: Map<string, { tipoNome: string; valor: number }>;
        };

        const bancosCategorizadosMap = new Map<string, BancoCategoriaAcumulado>();

        contasMap.forEach((conta) => {
          const contaCodigo = toString(conta.contaCodigo);
          const contaNome = toString(conta.contaNome).toUpperCase();
          const tipoNome = toString(conta.tipoNome).toUpperCase();

          // Identificar se é Títulos ou Depósitos baseado no código ou nome da CONTA DE RECEITA
          const ehTitulos = contaNome.includes('TÍTULO') || contaNome.includes('TITULO') || contaCodigo.startsWith('301');
          const ehDepositos = contaNome.includes('DEPÓSITO') || contaNome.includes('DEPOSITO') || contaCodigo.startsWith('302') || contaCodigo.startsWith('303');

          if (!ehTitulos && !ehDepositos) {
            return; // Ignora contas que não são Títulos nem Depósitos
          }

          // Identificar se é Receita Prevista ou Outras Receitas baseado no TIPO
          const ehReceitaPrevista = tipoNome.includes('RECEITA PREVISTA') || tipoNome.includes('PREVISTA');

          const banco = bancosCategorizadosMap.get(conta.bancoId) ?? {
            nome: conta.bancoNome,
            titulosReceitaPrevista: new Map(),
            titulosOutrasReceitas: new Map(),
            depositosReceitaPrevista: new Map(),
            depositosOutrasReceitas: new Map(),
          };

          if (ehTitulos) {
            if (ehReceitaPrevista) {
              const tipoExistente = banco.titulosReceitaPrevista.get(conta.tipoId) ?? {
                tipoNome: conta.tipoNome,
                valor: 0,
              };
              tipoExistente.valor += conta.realizado;
              banco.titulosReceitaPrevista.set(conta.tipoId, tipoExistente);
            } else {
              const tipoExistente = banco.titulosOutrasReceitas.get(conta.tipoId) ?? {
                tipoNome: conta.tipoNome,
                valor: 0,
              };
              tipoExistente.valor += conta.realizado;
              banco.titulosOutrasReceitas.set(conta.tipoId, tipoExistente);
            }
          } else if (ehDepositos) {
            if (ehReceitaPrevista) {
              const tipoExistente = banco.depositosReceitaPrevista.get(conta.tipoId) ?? {
                tipoNome: conta.tipoNome,
                valor: 0,
              };
              tipoExistente.valor += conta.realizado;
              banco.depositosReceitaPrevista.set(conta.tipoId, tipoExistente);
            } else {
              const tipoExistente = banco.depositosOutrasReceitas.get(conta.tipoId) ?? {
                tipoNome: conta.tipoNome,
                valor: 0,
              };
              tipoExistente.valor += conta.realizado;
              banco.depositosOutrasReceitas.set(conta.tipoId, tipoExistente);
            }
          }

          bancosCategorizadosMap.set(conta.bancoId, banco);
        });

        const bancosCategorizado: BancoCategorizado[] = Array.from(bancosCategorizadosMap.entries())
          .map(([id, banco]) => {
            // Títulos - Receita Prevista
            const titulosReceitaPrevistaTipos: TipoValor[] = Array.from(banco.titulosReceitaPrevista.entries())
              .map(([tipoId, tipo]) => ({
                tipoId,
                tipoNome: tipo.tipoNome,
                valor: arredondar(tipo.valor),
              }))
              .filter(t => t.valor > 0)
              .sort((a, b) => b.valor - a.valor);

            // Títulos - Outras Receitas
            const titulosOutrasReceitasTipos: TipoValor[] = Array.from(banco.titulosOutrasReceitas.entries())
              .map(([tipoId, tipo]) => ({
                tipoId,
                tipoNome: tipo.tipoNome,
                valor: arredondar(tipo.valor),
              }))
              .filter(t => t.valor > 0)
              .sort((a, b) => b.valor - a.valor);

            // Depósitos - Receita Prevista
            const depositosReceitaPrevistaTipos: TipoValor[] = Array.from(banco.depositosReceitaPrevista.entries())
              .map(([tipoId, tipo]) => ({
                tipoId,
                tipoNome: tipo.tipoNome,
                valor: arredondar(tipo.valor),
              }))
              .filter(t => t.valor > 0)
              .sort((a, b) => b.valor - a.valor);

            // Depósitos - Outras Receitas
            const depositosOutrasReceitasTipos: TipoValor[] = Array.from(banco.depositosOutrasReceitas.entries())
              .map(([tipoId, tipo]) => ({
                tipoId,
                tipoNome: tipo.tipoNome,
                valor: arredondar(tipo.valor),
              }))
              .filter(t => t.valor > 0)
              .sort((a, b) => b.valor - a.valor);

            const titulosTotalReceitaPrevista = arredondar(titulosReceitaPrevistaTipos.reduce((sum, t) => sum + t.valor, 0));
            const titulosTotalOutrasReceitas = arredondar(titulosOutrasReceitasTipos.reduce((sum, t) => sum + t.valor, 0));
            const depositosTotalReceitaPrevista = arredondar(depositosReceitaPrevistaTipos.reduce((sum, t) => sum + t.valor, 0));
            const depositosTotalOutrasReceitas = arredondar(depositosOutrasReceitasTipos.reduce((sum, t) => sum + t.valor, 0));

            return {
              id,
              nome: banco.nome,
              titulos: {
                tiposReceitaPrevista: titulosReceitaPrevistaTipos,
                tiposOutrasReceitas: titulosOutrasReceitasTipos,
                totalReceitaPrevista: titulosTotalReceitaPrevista,
                totalOutrasReceitas: titulosTotalOutrasReceitas,
                total: arredondar(titulosTotalReceitaPrevista + titulosTotalOutrasReceitas),
              },
              depositos: {
                tiposReceitaPrevista: depositosReceitaPrevistaTipos,
                tiposOutrasReceitas: depositosOutrasReceitasTipos,
                totalReceitaPrevista: depositosTotalReceitaPrevista,
                totalOutrasReceitas: depositosTotalOutrasReceitas,
                total: arredondar(depositosTotalReceitaPrevista + depositosTotalOutrasReceitas),
              },
            };
          })
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        // Totais consolidados
        const totalPrevisto = arredondar(bancos.reduce((acc, banco) => acc + banco.previsto, 0));
        const totalRealizado = arredondar(bancos.reduce((acc, banco) => acc + banco.realizado, 0));
        const diferenca = arredondar(totalRealizado - totalPrevisto);

        // Calcular totais separados por categoria (receita prevista vs outras receitas)
        const titulosTotalReceitaPrevista = arredondar(
          bancosCategorizado.reduce((acc, b) => acc + b.titulos.totalReceitaPrevista, 0)
        );
        const titulosTotalOutrasReceitas = arredondar(
          bancosCategorizado.reduce((acc, b) => acc + b.titulos.totalOutrasReceitas, 0)
        );
        const titulosTotal = arredondar(titulosTotalReceitaPrevista + titulosTotalOutrasReceitas);

        const depositosTotalReceitaPrevista = arredondar(
          bancosCategorizado.reduce((acc, b) => acc + b.depositos.totalReceitaPrevista, 0)
        );
        const depositosTotalOutrasReceitas = arredondar(
          bancosCategorizado.reduce((acc, b) => acc + b.depositos.totalOutrasReceitas, 0)
        );
        const depositosTotal = arredondar(depositosTotalReceitaPrevista + depositosTotalOutrasReceitas);

        const totalCategorizado = titulosTotal + depositosTotal;
        const percentualTitulos = totalCategorizado > 0 ? arredondar((titulosTotal / totalCategorizado) * 100) : 0;
        const percentualDepositos = totalCategorizado > 0 ? arredondar((depositosTotal / totalCategorizado) * 100) : 0;

        setRelatorio({
          data,
          bancos,
          bancosCategorizado,
          totais: {
            previsto: totalPrevisto,
            realizado: totalRealizado,
            diferenca,
            titulosTotal,
            titulosTotalReceitaPrevista,
            titulosTotalOutrasReceitas,
            depositosTotal,
            depositosTotalReceitaPrevista,
            depositosTotalOutrasReceitas,
            percentualTitulos,
            percentualDepositos,
          },
        });
        setErro(null);
      } catch (error) {
        console.error('Erro ao carregar relatório de cobrança:', error);
        setErro(
          traduzirErroSupabase(
            error,
            'Não foi possível gerar o relatório de cobrança para a data selecionada.',
          ),
        );
        setRelatorio(null);
      } finally {
        setCarregandoDados(false);
      }
    },
    [usuario],
  );

  useEffect(() => {
    if (!usuario) {
      return;
    }
    carregarRelatorio(dataReferencia);
  }, [usuario, dataReferencia, carregarRelatorio]);

  const handleAplicarFiltro = useCallback(() => {
      if (!dataFiltro) {
        return;
      }
      setDataReferencia(dataFiltro);
    },
    [dataFiltro],
  );

  const gerarDocumentoPdf = useCallback(() => {
    if (!relatorio) {
      return null;
    }

    const doc = new jsPDF('portrait', 'mm', 'a4');
    const margem = 12;
    const larguraPagina = doc.internal.pageSize.getWidth();
    const larguraUtil = larguraPagina - 2 * margem;

    // Cabeçalho
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Relatório de Cobrança', margem, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Data: ${formatarDataPt(relatorio.data)}`, margem, 18);

    let posY = 24;

    // ============ INDICADORES SUPERIORES ============
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Indicadores do Dia', margem, posY);
    posY += 2;

    const cardWidth = larguraUtil / 3 - 2;
    const cardHeight = 18;

    // Card 1: Previsto
    doc.setDrawColor(59, 130, 246); // blue
    doc.setFillColor(239, 246, 255); // blue-50
    doc.roundedRect(margem, posY, cardWidth, cardHeight, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(55, 65, 81); // gray-700
    doc.text('PREVISTO', margem + 2, posY + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175); // blue-800
    doc.text(formatCurrency(relatorio.totais.previsto), margem + 2, posY + 10);

    // Card 2: Realizado
    const card2X = margem + cardWidth + 3;
    doc.setDrawColor(34, 197, 94); // green
    doc.setFillColor(240, 253, 244); // green-50
    doc.roundedRect(card2X, posY, cardWidth, cardHeight, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(55, 65, 81);
    doc.text('REALIZADO', card2X + 2, posY + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(21, 128, 61); // green-700
    doc.text(formatCurrency(relatorio.totais.realizado), card2X + 2, posY + 10);

    // Card 3: Cobertura
    const card3X = card2X + cardWidth + 3;
    const cobertura = relatorio.totais.previsto > 0
      ? ((relatorio.totais.realizado / relatorio.totais.previsto) * 100).toFixed(1)
      : '0.0';
    doc.setDrawColor(147, 51, 234); // purple
    doc.setFillColor(250, 245, 255); // purple-50
    doc.roundedRect(card3X, posY, cardWidth, cardHeight, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(55, 65, 81);
    doc.text('% COBERTURA', card3X + 2, posY + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(126, 34, 206); // purple-700
    doc.text(`${cobertura}%`, card3X + 2, posY + 11);

    // Linha divisória adicional nos cards
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(107, 114, 128); // gray-500
    doc.text('Títulos + Depósitos', margem + 2, posY + 15);
    doc.text('Total do dia', card2X + 2, posY + 15);
    doc.text('Meta alcançada', card3X + 2, posY + 15);

    // Reset colors
    doc.setTextColor(0, 0, 0);

    posY += cardHeight + 8;

    // Seção: Resumo por Conta de Receita
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Resumo por Conta de Receita - Realizado', margem, posY);
    posY += 6;

    // Títulos e Depósitos lado a lado
    const colunaWidth = larguraUtil / 2 - 2;

    // TÍTULOS (Esquerda)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Títulos', margem, posY);

    autoTable(doc, {
      startY: posY + 2,
      head: [['Item', 'Valor']],
      body: [
        ['Receita Prevista', formatCurrency(relatorio.totais.titulosTotalReceitaPrevista)],
        ['Outras Receitas', formatCurrency(relatorio.totais.titulosTotalOutrasReceitas)],
      ],
      foot: [['Total', formatCurrency(relatorio.totais.titulosTotal)]],
      theme: 'grid',
      styles: { fontSize: 8, halign: 'right', cellPadding: 1.5, lineWidth: 0.5, lineColor: [0, 0, 0] },
      headStyles: { fillColor: [31, 73, 125], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { halign: 'left' } },
      footStyles: { fontStyle: 'bold', fillColor: [240, 248, 255] },
      margin: { left: margem, right: larguraPagina / 2 + 2 },
      tableLineWidth: 0.5,
      tableLineColor: [0, 0, 0],
    });

    const titulosFinalY = (doc as any).lastAutoTable.finalY;

    // DEPÓSITOS (Direita)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Depósitos', larguraPagina / 2 + 2, posY);

    autoTable(doc, {
      startY: posY + 2,
      head: [['Item', 'Valor']],
      body: [
        ['Receita Prevista', formatCurrency(relatorio.totais.depositosTotalReceitaPrevista)],
        ['Outras Receitas', formatCurrency(relatorio.totais.depositosTotalOutrasReceitas)],
      ],
      foot: [['Total', formatCurrency(relatorio.totais.depositosTotal)]],
      theme: 'grid',
      styles: { fontSize: 8, halign: 'right', cellPadding: 1.5, lineWidth: 0.5, lineColor: [0, 0, 0] },
      headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { halign: 'left' } },
      footStyles: { fontStyle: 'bold', fillColor: [240, 255, 240] },
      margin: { left: larguraPagina / 2 + 2, right: margem },
      tableLineWidth: 0.5,
      tableLineColor: [0, 0, 0],
    });

    posY = Math.max(titulosFinalY, (doc as any).lastAutoTable.finalY) + 8;

    // Seção: Receitas em Títulos (bancos lado a lado - CARDS UNIFORMES)
    const temTitulos = relatorio.bancosCategorizado.some(b => b.titulos.total > 0);
    if (temTitulos) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Receitas em Títulos por Banco', margem, posY);
      posY += 4;

      const bancosComTitulos = relatorio.bancosCategorizado.filter(b => b.titulos.total > 0);

      // Cards uniformes em grid fixo de 3 colunas
      const numColunas = 3;
      const colWidth = (larguraUtil - 4) / numColunas; // 4mm de gaps entre cards
      const cardHeightUniforme = 35; // Altura fixa para todos os cards

      bancosComTitulos.forEach((banco, index) => {
        const row = Math.floor(index / numColunas);
        const col = index % numColunas;
        const colX = margem + (colWidth + 2) * col;
        const startYPos = posY + (row * (cardHeightUniforme + 3));

        // Combinar tipos de receita prevista e outras receitas
        const todosTiposTitulos = [
          ...banco.titulos.tiposReceitaPrevista,
          ...banco.titulos.tiposOutrasReceitas
        ];

        // Usar autoTable mas com altura mínima definida
        autoTable(doc, {
          startY: startYPos,
          head: [[banco.nome, '']],
          body: todosTiposTitulos.map(tipo => [tipo.tipoNome, formatCurrency(tipo.valor)]),
          foot: [['Total', formatCurrency(banco.titulos.total)]],
          theme: 'grid',
          styles: { fontSize: 7, halign: 'right', cellPadding: 1.5, lineWidth: 0.5, lineColor: [0, 0, 0] },
          headStyles: { fillColor: [31, 73, 125], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
          columnStyles: { 0: { halign: 'left', cellWidth: colWidth * 0.6 } },
          footStyles: { fontStyle: 'bold', fontSize: 8, fillColor: [240, 248, 255] },
          margin: { left: colX, right: larguraPagina - colX - colWidth },
          tableWidth: colWidth,
          tableLineWidth: 0.5,
          tableLineColor: [0, 0, 0],
        });
      });

      // Calcular próxima posição baseada no número de linhas de cards
      const numLinhas = Math.ceil(bancosComTitulos.length / numColunas);
      posY += (numLinhas * (cardHeightUniforme + 3)) + 4;
    }

    // Seção: Receitas em Depósitos (bancos lado a lado - CARDS UNIFORMES)
    const temDepositos = relatorio.bancosCategorizado.some(b => b.depositos.total > 0);
    if (temDepositos) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Receitas em Depósitos por Banco', margem, posY);
      posY += 4;

      const bancosComDepositos = relatorio.bancosCategorizado.filter(b => b.depositos.total > 0);

      // Cards uniformes em grid fixo de 3 colunas
      const numColunas = 3;
      const colWidth = (larguraUtil - 4) / numColunas;
      const cardHeightUniforme = 35;

      bancosComDepositos.forEach((banco, index) => {
        const row = Math.floor(index / numColunas);
        const col = index % numColunas;
        const colX = margem + (colWidth + 2) * col;
        const startYPos = posY + (row * (cardHeightUniforme + 3));

        // Combinar tipos de receita prevista e outras receitas
        const todosTiposDepositos = [
          ...banco.depositos.tiposReceitaPrevista,
          ...banco.depositos.tiposOutrasReceitas
        ];

        autoTable(doc, {
          startY: startYPos,
          head: [[banco.nome, '']],
          body: todosTiposDepositos.map(tipo => [tipo.tipoNome, formatCurrency(tipo.valor)]),
          foot: [['Total', formatCurrency(banco.depositos.total)]],
          theme: 'grid',
          styles: { fontSize: 7, halign: 'right', cellPadding: 1.5, lineWidth: 0.5, lineColor: [0, 0, 0] },
          headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
          columnStyles: { 0: { halign: 'left', cellWidth: colWidth * 0.6 } },
          footStyles: { fontStyle: 'bold', fontSize: 8, fillColor: [240, 255, 240] },
          margin: { left: colX, right: larguraPagina - colX - colWidth },
          tableWidth: colWidth,
          tableLineWidth: 0.5,
          tableLineColor: [0, 0, 0],
        });
      });

      const numLinhas = Math.ceil(bancosComDepositos.length / numColunas);
      posY += (numLinhas * (cardHeightUniforme + 3)) + 4;
    }

    // Seção: Total Previsto x Realizado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Total Previsto x Realizado', margem, posY);
    posY += 2;

    autoTable(doc, {
      startY: posY,
      body: [
        ['Receita Prevista (Títulos + Depósitos)', formatCurrency(relatorio.totais.previsto)],
        ['Receita Realizada', formatCurrency(relatorio.totais.realizado)],
        ['% de Cobertura', `${relatorio.totais.previsto > 0 ? ((relatorio.totais.realizado / relatorio.totais.previsto) * 100).toFixed(1) : '0'}%`],
      ],
      theme: 'grid',
      styles: { fontSize: 9, halign: 'right', cellPadding: 2, fontStyle: 'bold', lineWidth: 0.5, lineColor: [0, 0, 0] },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { fontStyle: 'bold' } },
      margin: { left: margem, right: margem },
      tableLineWidth: 0.5,
      tableLineColor: [0, 0, 0],
    });

    return doc;
  }, [relatorio]);

  const handleExportPdf = useCallback(() => {
    if (!relatorio) {
      alert('Nenhum relatório disponível para exportar.');
      return;
    }

    const doc = gerarDocumentoPdf();
    if (!doc) {
      alert('Não foi possível gerar o PDF. Tente novamente.');
      return;
    }

    const nomeArquivo = `Relatorio_Cobranca_${relatorio.data.replace(/-/g, '')}.pdf`;
    doc.save(nomeArquivo);
  }, [gerarDocumentoPdf, relatorio]);

  const handleAbrirModalEmail = useCallback(() => {
    setFeedbackEmail(null);
    if (!emailDestino && usuario?.usr_email) {
      setEmailDestino(usuario.usr_email);
    }
    setEmailModalAberto(true);
  }, [emailDestino, usuario]);

  const handleEnviarEmail = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!relatorio) {
        setFeedbackEmail('Nenhum relatório disponível para envio.');
        return;
      }
      if (!emailDestino.trim()) {
        setFeedbackEmail('Informe um destinatário para continuar.');
        return;
      }

      try {
        setEnviandoEmail(true);
        setFeedbackEmail(null);

        const doc = gerarDocumentoPdf();
        if (!doc) {
          throw new Error('Não foi possível gerar o documento.');
        }

        const nomeArquivo = `Relatorio_Cobranca_${relatorio.data.replace(/-/g, '')}.pdf`;
        const blob = doc.output('blob');
        const arquivo = new File([blob], nomeArquivo, { type: 'application/pdf' });

        const nav = navigator as Navigator & {
          canShare?: (data: { files?: File[] }) => boolean;
          share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
        };

        if (nav.canShare && nav.share && nav.canShare({ files: [arquivo] })) {
          await nav.share({
            files: [arquivo],
            title: 'Relatório de Cobrança',
            text: emailMensagem || `Segue relatório de cobrança referente a ${formatarDataPt(relatorio.data)}.`,
          });
          setEmailModalAberto(false);
          return;
        }

        doc.save(nomeArquivo);

        const assunto = encodeURIComponent(`Relatório - Cobrança (${formatarDataPt(relatorio.data)})`);
        const corpo = encodeURIComponent(
          `${emailMensagem || 'Segue relatório de cobrança atualizado.'}\n\nO arquivo foi baixado automaticamente e pode ser anexado ao e-mail.`,
        );
        window.location.href = `mailto:${encodeURIComponent(emailDestino)}?subject=${assunto}&body=${corpo}`;

        setEmailModalAberto(false);
      } catch (error) {
        console.error('Erro ao preparar envio por e-mail:', error);
        setFeedbackEmail('Não foi possível preparar o envio. Tente novamente em instantes.');
      } finally {
        setEnviandoEmail(false);
      }
    },
    [emailDestino, emailMensagem, gerarDocumentoPdf, relatorio],
  );

  const botoesAcoes = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Data:</label>
        <input
          type="date"
          value={dataFiltro}
          onChange={(event) => setDataFiltro(event.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <Button
        type="button"
        variant="primary"
        onClick={handleAplicarFiltro}
        disabled={carregandoDados}
      >
        Gerar relatório
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={handleAbrirModalEmail}
        disabled={carregandoDados || !relatorio}
      >
        Enviar por e-mail
      </Button>
      <Button
        type="button"
        variant="primary"
        onClick={handleExportPdf}
        disabled={carregandoDados || !relatorio}
      >
        Exportar PDF
      </Button>
    </div>
  );

  if (carregandoUsuario) {
    return (
      <>
        <Header title="Relatório de Cobrança" />
        <div className="page-content flex h-80 items-center justify-center">
          <Loading text="Carregando informações do relatório..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Relatório de Cobrança"
        subtitle="Acompanhe as receitas previstas e realizadas por banco em um único dia"
        actions={botoesAcoes}
      />

      <div className="page-content space-y-6">
        {erro && (
          <Card variant="danger" title="Não foi possível gerar o relatório">
            <p className="text-sm text-gray-700">{erro}</p>
          </Card>
        )}

        {carregandoDados ? (
          <Card>
            <div className="flex h-48 items-center justify-center">
              <Loading text="Consolidando informações da cobrança..." />
            </div>
          </Card>
        ) : relatorio ? (
          <>
            {/* Grid com dois cards lado a lado */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Resumo por Banco */}
              <Card
                title={`Resumo por Banco (${formatarDataPt(relatorio.data)})`}
                subtitle="Valores realizados por banco"
              >
                {relatorio.bancos.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum banco apresentou movimentação na data selecionada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-gray-700">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Banco</th>
                          <th className="px-4 py-3 text-right font-semibold">Realizado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {relatorio.bancos.map((banco) => (
                          <tr key={banco.id}>
                            <td className="px-4 py-3 font-medium text-gray-800">{banco.nome}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(banco.realizado)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 text-sm font-semibold text-gray-700 border-t-2 border-gray-400">
                        <tr>
                          <td className="px-4 py-3 text-right">Total</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(relatorio.totais.realizado)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </Card>

              {/* Resumo por Conta de Receita */}
              <Card
                title={<span className="text-base font-bold">Resumo por Conta de Receita ({formatarDataPt(relatorio.data)})</span>}
                subtitle="Separação por Títulos e Depósitos"
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-4 py-3 text-left font-bold text-gray-700 border border-gray-300">Categoria</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700 border border-gray-300">Receita Prevista</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700 border border-gray-300">Outras Receitas</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700 border border-gray-300">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="hover:bg-blue-50">
                        <td className="px-4 py-3 font-semibold text-gray-800 border border-gray-300">Títulos</td>
                        <td className="px-4 py-3 text-right text-gray-900 border border-gray-300">
                          {formatCurrency(relatorio.totais.titulosTotalReceitaPrevista)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 border border-gray-300">
                          {formatCurrency(relatorio.totais.titulosTotalOutrasReceitas)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900 border border-gray-300">
                          {formatCurrency(relatorio.totais.titulosTotal)}
                        </td>
                      </tr>
                      <tr className="hover:bg-green-50">
                        <td className="px-4 py-3 font-semibold text-gray-800 border border-gray-300">Depósitos</td>
                        <td className="px-4 py-3 text-right text-gray-900 border border-gray-300">
                          {formatCurrency(relatorio.totais.depositosTotalReceitaPrevista)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 border border-gray-300">
                          {formatCurrency(relatorio.totais.depositosTotalOutrasReceitas)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900 border border-gray-300">
                          {formatCurrency(relatorio.totais.depositosTotal)}
                        </td>
                      </tr>
                      <tr className="bg-gray-50 font-bold">
                        <td className="px-4 py-3 text-gray-900 border border-gray-300">TOTAL GERAL</td>
                        <td className="px-4 py-3 text-right text-gray-900 border border-gray-300">
                          {formatCurrency(relatorio.totais.titulosTotalReceitaPrevista + relatorio.totais.depositosTotalReceitaPrevista)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 border border-gray-300">
                          {formatCurrency(relatorio.totais.titulosTotalOutrasReceitas + relatorio.totais.depositosTotalOutrasReceitas)}
                        </td>
                        <td className="px-4 py-3 text-right text-lg text-primary-700 border border-gray-300">
                          {formatCurrency(relatorio.totais.realizado)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Total Previsto x Realizado */}
                  <div className="bg-gray-50 mt-4 px-4 py-3 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-gray-900 mb-3 text-sm">Previsto x Realizado</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="flex justify-between items-center bg-white border border-blue-200 px-3 py-2 rounded">
                        <span className="text-gray-700 font-medium">Previsto:</span>
                        <span className="text-blue-900 font-bold">
                          {formatCurrency(relatorio.totais.previsto)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white border border-green-200 px-3 py-2 rounded">
                        <span className="text-gray-700 font-medium">Realizado:</span>
                        <span className="text-green-900 font-bold">
                          {formatCurrency(relatorio.totais.realizado)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white border border-purple-200 px-3 py-2 rounded">
                        <span className="text-gray-700 font-medium">Cobertura:</span>
                        <span className="text-purple-900 font-bold text-base">
                          {relatorio.totais.previsto > 0
                            ? `${((relatorio.totais.realizado / relatorio.totais.previsto) * 100).toFixed(1)}%`
                            : '0%'
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Títulos Section - só mostra se houver títulos */}
            {relatorio.bancosCategorizado.some(b => b.titulos.total > 0) && (
              <div className="mt-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Receitas em Títulos</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  {relatorio.bancosCategorizado
                    .filter(banco => banco.titulos.total > 0)
                    .map((banco) => (
                      <Card key={`titulos-${banco.id}`} title={banco.nome}>
                        <div className="space-y-2">
                          {[...banco.titulos.tiposReceitaPrevista, ...banco.titulos.tiposOutrasReceitas].map((tipo) => (
                            <div key={`titulo-${banco.id}-${tipo.tipoId}`} className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">{tipo.tipoNome}</span>
                              <span className="text-sm font-semibold text-gray-900">
                                {formatCurrency(tipo.valor)}
                              </span>
                            </div>
                          ))}
                          <div className="pt-2 border-t border-gray-200">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-bold text-gray-800">Total</span>
                              <span className="text-base font-bold text-success-700">
                                {formatCurrency(banco.titulos.total)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              </div>
            )}

            {/* Depósitos Section - só mostra se houver depósitos */}
            {relatorio.bancosCategorizado.some(b => b.depositos.total > 0) && (
              <div className="mt-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Receitas em Depósitos</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  {relatorio.bancosCategorizado
                    .filter(banco => banco.depositos.total > 0)
                    .map((banco) => (
                      <Card key={`depositos-${banco.id}`} title={banco.nome}>
                        <div className="space-y-2">
                          {[...banco.depositos.tiposReceitaPrevista, ...banco.depositos.tiposOutrasReceitas].map((tipo) => (
                            <div key={`deposito-${banco.id}-${tipo.tipoId}`} className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">{tipo.tipoNome}</span>
                              <span className="text-sm font-semibold text-gray-900">
                                {formatCurrency(tipo.valor)}
                              </span>
                            </div>
                          ))}
                          <div className="pt-2 border-t border-gray-200">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-bold text-gray-800">Total</span>
                              <span className="text-base font-bold text-success-700">
                                {formatCurrency(banco.depositos.total)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              </div>
            )}

            {/* Resumo Final Detalhado */}
            <Card title="Resumo Final" subtitle={`Consolidação completa do dia ${formatarDataPt(relatorio.data)}`}>
              <div className="space-y-6">
                {/* Resumo por Categoria */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="text-sm font-bold text-blue-900 uppercase mb-3">Receitas em Títulos</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-blue-800">Total Realizado:</span>
                        <span className="font-bold text-blue-900">{formatCurrency(relatorio.totais.titulosTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-700">Percentual do Total:</span>
                        <span className="font-semibold text-blue-800 bg-blue-100 px-2 py-1 rounded">
                          {relatorio.totais.percentualTitulos.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h3 className="text-sm font-bold text-green-900 uppercase mb-3">Receitas em Depósitos</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-green-800">Total Realizado:</span>
                        <span className="font-bold text-green-900">{formatCurrency(relatorio.totais.depositosTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-green-700">Percentual do Total:</span>
                        <span className="font-semibold text-green-800 bg-green-100 px-2 py-1 rounded">
                          {relatorio.totais.percentualDepositos.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Comparativo Previsto x Realizado */}
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-300">
                  <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    Comparativo do Dia
                  </h3>
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-white rounded p-4 border border-gray-200">
                        <div className="text-xs font-semibold text-gray-600 uppercase mb-1">Receitas Previstas</div>
                        <div className="text-2xl font-bold text-gray-900">{formatCurrency(relatorio.totais.previsto)}</div>
                      </div>
                      <div className="bg-white rounded p-4 border border-gray-200">
                        <div className="text-xs font-semibold text-gray-600 uppercase mb-1">Receitas Realizadas</div>
                        <div className="text-2xl font-bold text-success-700">{formatCurrency(relatorio.totais.realizado)}</div>
                      </div>
                      <div className="bg-white rounded p-4 border border-gray-200">
                        <div className="text-xs font-semibold text-gray-600 uppercase mb-1">Diferença</div>
                        <div className={`text-2xl font-bold ${relatorio.totais.diferenca >= 0 ? 'text-success-700' : 'text-error-600'}`}>
                          {formatCurrency(relatorio.totais.diferenca)}
                        </div>
                        {relatorio.totais.previsto > 0 && (
                          <div className="mt-1 text-xs font-medium text-gray-600">
                            {((relatorio.totais.realizado / relatorio.totais.previsto) * 100).toFixed(1)}% do previsto
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total Geral */}
                <div className="bg-primary-50 rounded-lg p-6 border-2 border-primary-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-primary-900">Total Geral Realizado</h3>
                      <p className="text-sm text-primary-700 mt-1">Soma de todas as categorias</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-primary-900">
                        {formatCurrency(relatorio.totais.realizado)}
                      </div>
                      {relatorio.totais.previsto > 0 && (
                        <div className="mt-2 inline-flex items-center gap-2 bg-primary-100 px-3 py-1 rounded-full">
                          <span className="text-xs font-semibold text-primary-800">
                            Cobertura: {((relatorio.totais.realizado / relatorio.totais.previsto) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </>
        ) : (
          <Card title="Nenhum dado encontrado">
            <p className="text-sm text-gray-600">
              Não localizamos informações para a data selecionada. Ajuste o filtro e tente novamente.
            </p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={emailModalAberto}
        onClose={() => {
          if (!enviandoEmail) {
            setEmailModalAberto(false);
          }
        }}
        title="Enviar relatório por e-mail"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEmailModalAberto(false)}
              disabled={enviandoEmail}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="cobranca-email-form"
              variant="primary"
              loading={enviandoEmail}
              disabled={enviandoEmail}
            >
              Preparar envio
            </Button>
          </div>
        }
      >
        <form id="cobranca-email-form" onSubmit={handleEnviarEmail} className="space-y-4">
          <Input
            label="Destinatário"
            type="email"
            value={emailDestino}
            onChange={(event) => setEmailDestino(event.target.value)}
            placeholder="usuario@empresa.com.br"
            required
          />
          <Textarea
            label="Mensagem"
            value={emailMensagem}
            onChange={(event) => setEmailMensagem(event.target.value)}
            placeholder="Mensagem opcional para acompanhar o relatório."
            rows={4}
          />
          <p className="text-xs text-gray-500">
            O relatório será gerado em PDF. Se o navegador não suportar compartilhamento direto, o arquivo será baixado automaticamente para anexar ao e-mail.
          </p>
          {feedbackEmail && <p className="text-sm text-error-600">{feedbackEmail}</p>}
        </form>
      </Modal>
    </>
  );
};

export default RelatorioCobrancaPage;
