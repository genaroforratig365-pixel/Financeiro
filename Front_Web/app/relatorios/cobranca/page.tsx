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
  pvi_tpr_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_id?: unknown; tpr_nome?: unknown; tpr_codigo?: unknown } | null>;
};

type CobrancaRow = {
  cob_valor?: unknown;
  cob_ctr_id?: unknown;
  cob_ban_id?: unknown;
  cob_tpr_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_id?: unknown; tpr_nome?: unknown; tpr_codigo?: unknown } | null>;
};

type BancoRow = {
  ban_id?: unknown;
  ban_nome?: unknown;
  ban_codigo?: unknown;
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

type ContaBancoResumo = {
  id: string;
  titulo: string; // "Títulos - Banco do Brasil" ou "Depósitos - Banco Bradesco"
  contaNome: string; // "Títulos" ou "Depósitos"
  bancoNome: string; // "Banco do Brasil"
  receitaPrevista: number;
  outrasReceitas: number;
  tipos: TipoResumo[];
};

type RelatorioCobranca = {
  data: string;
  bancos: BancoResumo[];
  contasBancos: ContaBancoResumo[];
  totais: {
    previsto: number;
    realizado: number;
    diferenca: number;
    percentual: number;
    receitaPrevista: number;
    outrasReceitas: number;
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

        const [previsoesRes, cobrancasRes, bancosRes] = await Promise.all([
          supabase
            .from('pvi_previsao_itens')
            .select(
              'pvi_valor, pvi_ctr_id, pvi_ban_id, pvi_tpr_id, ctr_contas_receita(ctr_nome, ctr_codigo), tpr_tipos_receita(tpr_id, tpr_nome, tpr_codigo)',
            )
            .eq('pvi_tipo', 'receita')
            .eq('pvi_data', data),
          supabase
            .from('cob_cobrancas')
            .select('cob_valor, cob_ctr_id, cob_ban_id, cob_tpr_id, ctr_contas_receita(ctr_nome, ctr_codigo), tpr_tipos_receita(tpr_id, tpr_nome, tpr_codigo)')
            .eq('cob_data', data),
          supabase
            .from('ban_bancos')
            .select('ban_id, ban_nome, ban_codigo'),
        ]);

        if (previsoesRes.error) throw previsoesRes.error;
        if (cobrancasRes.error) throw cobrancasRes.error;
        if (bancosRes.error) throw bancosRes.error;

        const previsoes = normalizeRelation(previsoesRes.data as MaybeArray<PrevisaoRow>);
        const cobrancas = normalizeRelation(cobrancasRes.data as MaybeArray<CobrancaRow>);
        const bancosData = normalizeRelation(bancosRes.data as MaybeArray<BancoRow>);

        // Criar mapa de bancos para lookup rápido
        const bancosMap = new Map<number, { nome: string; codigo: string }>();
        bancosData.forEach((banco) => {
          const banId = toNumber(banco.ban_id);
          if (banId > 0) {
            bancosMap.set(banId, {
              nome: toString(banco.ban_nome, 'Banco não informado'),
              codigo: toString(banco.ban_codigo, ''),
            });
          }
        });

        type ContaResumo = {
          chave: string;
          contaNome: string;
          bancoId: string;
          bancoNome: string;
          tipoId: string;
          tipoNome: string;
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
          const contaId = toNumber(item.pvi_ctr_id, 0);
          const contaChave = construirChave(contaId, contaNome, 'conta');

          const bancoIdNumero = toNumber(item.pvi_ban_id, 0);
          const bancoInfo = bancosMap.get(bancoIdNumero);
          const bancoNome = bancoInfo?.nome ?? 'Banco não informado';
          const bancoChave = construirChave(bancoIdNumero, bancoNome, 'banco');

          const tipoIdNumero = toNumber(item.pvi_tpr_id, 0);
          const tipoRel = normalizeRelation(item.tpr_tipos_receita)[0];
          const tipoNome = tipoRel?.tpr_nome ? toString(tipoRel.tpr_nome) : contaNome;
          const tipoChave = construirChave(tipoIdNumero, tipoNome, 'tipo');

          const existente = contasMap.get(contaChave) ?? {
            chave: contaChave,
            contaNome,
            bancoId: bancoChave,
            bancoNome,
            tipoId: tipoChave,
            tipoNome,
            previsto: 0,
            realizado: 0,
          };

          existente.previsto += valor;
          existente.bancoId = bancoChave;
          existente.bancoNome = bancoNome;
          existente.tipoId = tipoChave;
          existente.tipoNome = tipoNome;
          contasMap.set(contaChave, existente);
        });

        cobrancas.forEach((item) => {
          const valor = arredondar(toNumber(item.cob_valor));
          if (valor === 0) {
            return;
          }

          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const contaNome = contaRel?.ctr_nome ? toString(contaRel.ctr_nome) : 'Conta não informada';
          const contaId = toNumber(item.cob_ctr_id, 0);
          const contaChave = construirChave(contaId, contaNome, 'conta');

          const bancoIdNumero = toNumber(item.cob_ban_id, 0);
          const bancoInfo = bancosMap.get(bancoIdNumero);
          const bancoNome = bancoInfo?.nome ?? 'Banco não informado';
          const bancoChave = construirChave(bancoIdNumero, bancoNome, 'banco');

          const tipoIdNumero = toNumber(item.cob_tpr_id, 0);
          const tipoRel = normalizeRelation(item.tpr_tipos_receita)[0];
          const tipoNome = tipoRel?.tpr_nome ? toString(tipoRel.tpr_nome) : contaNome;
          const tipoChave = construirChave(tipoIdNumero, tipoNome, 'tipo');

          const existente = contasMap.get(contaChave) ?? {
            chave: contaChave,
            contaNome,
            bancoId: bancoChave,
            bancoNome,
            tipoId: tipoChave,
            tipoNome,
            previsto: 0,
            realizado: 0,
          };

          existente.realizado += valor;
          existente.bancoId = bancoChave;
          existente.bancoNome = bancoNome;
          existente.tipoId = tipoChave;
          existente.tipoNome = tipoNome;
          contasMap.set(contaChave, existente);
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

        // Criar estrutura ContaBanco (Títulos/Depósitos por Banco)
        type ContaBancoAcumulado = {
          contaNome: string;
          bancoNome: string;
          tipos: Map<string, { nome: string; previsto: number; realizado: number }>;
        };

        const contasBancosMap = new Map<string, ContaBancoAcumulado>();

        contasMap.forEach((conta) => {
          if (conta.previsto === 0 && conta.realizado === 0) {
            return;
          }

          const chaveContaBanco = `${conta.contaNome}-${conta.bancoId}`;
          const contaBanco = contasBancosMap.get(chaveContaBanco) ?? {
            contaNome: conta.contaNome,
            bancoNome: conta.bancoNome,
            tipos: new Map(),
          };

          const tipo = contaBanco.tipos.get(conta.tipoId) ?? {
            nome: conta.tipoNome,
            previsto: 0,
            realizado: 0,
          };

          tipo.previsto += conta.previsto;
          tipo.realizado += conta.realizado;
          contaBanco.tipos.set(conta.tipoId, tipo);
          contasBancosMap.set(chaveContaBanco, contaBanco);
        });

        const contasBancos: ContaBancoResumo[] = Array.from(contasBancosMap.entries())
          .map(([chave, contaBanco]) => {
            const tipos: TipoResumo[] = Array.from(contaBanco.tipos.entries())
              .map(([tipoId, tipo]) => {
                const previsto = arredondar(tipo.previsto);
                const realizado = arredondar(tipo.realizado);
                const diferenca = arredondar(realizado - previsto);
                const percentual = previsto > 0 ? arredondar((realizado / previsto) * 100) : 0;
                return {
                  id: `${chave}-${tipoId}`,
                  nome: tipo.nome,
                  previsto,
                  realizado,
                  diferenca,
                  percentual,
                };
              })
              .filter((tipo) => tipo.realizado !== 0)
              .sort((a, b) => b.realizado - a.realizado);

            // Separar receita prevista de outras receitas
            const receitaPrevista = arredondar(
              tipos
                .filter((t) => t.nome.trim().toUpperCase().includes('PREVIS'))
                .reduce((acc, t) => acc + t.realizado, 0)
            );
            const outrasReceitas = arredondar(
              tipos
                .filter((t) => !t.nome.trim().toUpperCase().includes('PREVIS'))
                .reduce((acc, t) => acc + t.realizado, 0)
            );

            return {
              id: chave,
              titulo: `${contaBanco.contaNome} - ${contaBanco.bancoNome}`,
              contaNome: contaBanco.contaNome,
              bancoNome: contaBanco.bancoNome,
              receitaPrevista,
              outrasReceitas,
              tipos,
            };
          })
          .filter((cb) => cb.tipos.length > 0)
          .sort((a, b) => {
            // Ordenar por conta (Títulos antes de Depósitos) e depois por banco
            if (a.contaNome !== b.contaNome) {
              return a.contaNome.localeCompare(b.contaNome, 'pt-BR');
            }
            return a.bancoNome.localeCompare(b.bancoNome, 'pt-BR');
          });

        // Totais consolidados: soma TODOS os valores previstos e realizados
        const totalPrevisto = arredondar(bancos.reduce((acc, banco) => acc + banco.previsto, 0));
        const totalRealizado = arredondar(bancos.reduce((acc, banco) => acc + banco.realizado, 0));
        const diferenca = arredondar(totalRealizado - totalPrevisto);
        const percentual = totalPrevisto > 0 ? arredondar((totalRealizado / totalPrevisto) * 100) : 0;

        // Calcular receita prevista e outras receitas totais
        const totalReceitaPrevista = arredondar(
          contasBancos.reduce((acc, cb) => acc + cb.receitaPrevista, 0)
        );
        const totalOutrasReceitas = arredondar(
          contasBancos.reduce((acc, cb) => acc + cb.outrasReceitas, 0)
        );

        setRelatorio({
          data,
          bancos,
          contasBancos,
          totais: {
            previsto: totalPrevisto,
            realizado: totalRealizado,
            diferenca,
            percentual,
            receitaPrevista: totalReceitaPrevista,
            outrasReceitas: totalOutrasReceitas,
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
    const margem = 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Relatório - Cobrança', margem, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Data: ${formatarDataPt(relatorio.data)}`, margem, 20);

    let posY = 26;

    const resumoBody = relatorio.bancos.length === 0
      ? [['Nenhum banco com movimentação', '-', '-', '-', '-']]
      : relatorio.bancos.map((banco) => [
          banco.nome,
          formatCurrency(banco.previsto),
          formatCurrency(banco.realizado),
          formatCurrency(banco.diferenca),
          `${banco.percentual.toFixed(1).replace('.', ',')}%`,
        ]);

    autoTable(doc, {
      startY: posY,
      head: [['Banco', 'Previsto', 'Realizado', 'Diferença', '% REC']],
      body: resumoBody,
      styles: { fontSize: 8, halign: 'right', cellPadding: 2 },
      headStyles: { fillColor: [31, 73, 125], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'left' } },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margem, right: margem },
    });

    posY = (doc as any).lastAutoTable.finalY + 8;

    relatorio.bancos.forEach((banco, index) => {
      if (posY > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        posY = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Banco: ${banco.nome}`, margem, posY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(
        `Previsto: ${formatCurrency(banco.previsto)}  |  Realizado: ${formatCurrency(banco.realizado)}  |  Diferença: ${formatCurrency(banco.diferenca)}`,
        margem,
        posY + 5,
      );

      const tiposBody = banco.tipos.length === 0
        ? [['Nenhum tipo com valor realizado', '-', '-', '-', '-']]
        : banco.tipos.map((tipo) => [
            tipo.nome,
            formatCurrency(tipo.previsto),
            formatCurrency(tipo.realizado),
            formatCurrency(tipo.diferenca),
            `${tipo.percentual.toFixed(1).replace('.', ',')}%`,
          ]);

      autoTable(doc, {
        startY: posY + 9,
        head: [['Tipo de Receita', 'Previsto', 'Realizado', 'Diferença', '% REC']],
        body: tiposBody,
        styles: { fontSize: 8, halign: 'right', cellPadding: 2 },
        headStyles: { fillColor: [237, 242, 247], textColor: 51, fontStyle: 'bold' },
        columnStyles: { 0: { halign: 'left' } },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        margin: { left: margem, right: margem },
      });

      posY = (doc as any).lastAutoTable.finalY + 8;
    });

    if (posY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      posY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Totais do Dia', margem, posY);

    autoTable(doc, {
      startY: posY + 4,
      body: [
        ['Receitas realizadas', formatCurrency(relatorio.totais.realizado)],
        ['Valor da previsão de receita', formatCurrency(relatorio.totais.previsto)],
        ['Diferença entre receita e previsão', formatCurrency(relatorio.totais.diferenca)],
      ],
      styles: { fontSize: 9, cellPadding: 2, halign: 'right' },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
      theme: 'plain',
      margin: { left: margem, right: margem },
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
            <Card
              title={`Resumo por Banco (${formatarDataPt(relatorio.data)})`}
              subtitle="Comparativo entre valores previstos e realizados para cada banco com movimentação"
            >
              {relatorio.bancos.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum banco apresentou movimentação na data selecionada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-gray-700">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-center font-semibold">Banco</th>
                        <th className="px-4 py-3 text-center font-semibold">Realizado</th>
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

            {relatorio.contasBancos.length > 0 && (
              <>
                <Card
                  title="Resumo por Conta e Banco"
                  subtitle="Distribuição das receitas previstas e outras receitas"
                >
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-gray-700">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Conta de Receita</th>
                          <th className="px-4 py-3 text-right font-semibold">Receita Prevista</th>
                          <th className="px-4 py-3 text-right font-semibold">Outras Receitas</th>
                          <th className="px-4 py-3 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {/* Agrupar por tipo de conta (Títulos, Depósitos) */}
                        {['Títulos', 'Depósitos'].map((tipoConta) => {
                          const contasBancosFiltradas = relatorio.contasBancos.filter(
                            (cb) => cb.contaNome === tipoConta
                          );
                          if (contasBancosFiltradas.length === 0) return null;

                          const subtotalReceitaPrevista = contasBancosFiltradas.reduce(
                            (acc, cb) => acc + cb.receitaPrevista,
                            0
                          );
                          const subtotalOutrasReceitas = contasBancosFiltradas.reduce(
                            (acc, cb) => acc + cb.outrasReceitas,
                            0
                          );

                          return (
                            <React.Fragment key={tipoConta}>
                              <tr className="bg-gray-100 font-bold">
                                <td className="px-4 py-3" colSpan={4}>{tipoConta}</td>
                              </tr>
                              {contasBancosFiltradas.map((cb) => (
                                <tr key={cb.id}>
                                  <td className="px-4 py-3 pl-8 text-gray-800">{cb.bancoNome}</td>
                                  <td className="px-4 py-3 text-right text-gray-700">
                                    {formatCurrency(cb.receitaPrevista)}
                                  </td>
                                  <td className="px-4 py-3 text-right text-gray-700">
                                    {formatCurrency(cb.outrasReceitas)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                                    {formatCurrency(cb.receitaPrevista + cb.outrasReceitas)}
                                  </td>
                                </tr>
                              ))}
                              <tr className="bg-gray-50 font-semibold">
                                <td className="px-4 py-3 pl-8">Subtotal {tipoConta}</td>
                                <td className="px-4 py-3 text-right">
                                  {formatCurrency(subtotalReceitaPrevista)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {formatCurrency(subtotalOutrasReceitas)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {formatCurrency(subtotalReceitaPrevista + subtotalOutrasReceitas)}
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-100 text-sm font-bold text-gray-800 border-t-2 border-gray-400">
                        <tr>
                          <td className="px-4 py-3">Total Geral</td>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(relatorio.totais.receitaPrevista)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(relatorio.totais.outrasReceitas)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(relatorio.totais.realizado)}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3" colSpan={3}>Valor Previsto</td>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(relatorio.totais.previsto)}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3" colSpan={3}>Percentual Realizado</td>
                          <td className="px-4 py-3 text-right">
                            {relatorio.totais.percentual.toFixed(1).replace('.', ',')}%
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>

                <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-2">
                  {relatorio.contasBancos.map((contaBanco) => (
                    <Card
                      key={contaBanco.id}
                      title={contaBanco.titulo}
                      subtitle="Tipos de receita com movimentação"
                    >
                      {contaBanco.tipos.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          Nenhuma receita realizada nesta conta/banco na data selecionada.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm text-gray-700">
                            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                              <tr>
                                <th className="px-4 py-3 text-left font-semibold">Tipo de Receita</th>
                                <th className="px-4 py-3 text-right font-semibold">Realizado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {contaBanco.tipos.map((tipo) => (
                                <tr key={tipo.id}>
                                  <td className="px-4 py-3 font-medium text-gray-800">{tipo.nome}</td>
                                  <td className="px-4 py-3 text-right text-gray-700">
                                    {formatCurrency(tipo.realizado)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 font-semibold border-t border-gray-300">
                              <tr>
                                <td className="px-4 py-3">Total</td>
                                <td className="px-4 py-3 text-right">
                                  {formatCurrency(contaBanco.receitaPrevista + contaBanco.outrasReceitas)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </>
            )}

            <Card title="Totais consolidados do dia" subtitle="Resumo final das receitas previstas e realizadas">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-gray-700">
                  <tbody className="divide-y divide-gray-100 bg-white">
                    <tr>
                      <td className="px-4 py-3 font-medium text-gray-800">Receitas previstas do dia</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        {formatCurrency(relatorio.totais.previsto)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium text-gray-800">Receitas realizadas do dia</td>
                      <td className="px-4 py-3 text-right font-semibold text-success-700">
                        {formatCurrency(relatorio.totais.realizado)}
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-3 font-bold text-gray-900">Diferença (R$)</td>
                      <td
                        className={`px-4 py-3 text-right font-bold ${
                          relatorio.totais.diferenca >= 0 ? 'text-success-700' : 'text-error-600'
                        }`}
                      >
                        {formatCurrency(relatorio.totais.diferenca)}
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-3 font-bold text-gray-900">Diferença (%)</td>
                      <td
                        className={`px-4 py-3 text-right font-bold ${
                          relatorio.totais.diferenca >= 0 ? 'text-success-700' : 'text-error-600'
                        }`}
                      >
                        {relatorio.totais.percentual.toFixed(1).replace('.', ',')}%
                      </td>
                    </tr>
                  </tbody>
                </table>
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
