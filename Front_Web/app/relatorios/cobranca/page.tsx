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
  ban_bancos?: MaybeArray<{ ban_id?: unknown; ban_nome?: unknown; ban_codigo?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_id?: unknown; tpr_nome?: unknown; tpr_codigo?: unknown } | null>;
};

type CobrancaRow = {
  cob_valor?: unknown;
  cob_ctr_id?: unknown;
  cob_ban_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  ban_bancos?: MaybeArray<{ ban_id?: unknown; ban_nome?: unknown; ban_codigo?: unknown } | null>;
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

type CategoriaResumo = {
  receitaPrevista: number;
  outrasReceitas: number;
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
    depositosTotal: number;
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

        const [previsoesRes, cobrancasRes] = await Promise.all([
          supabase
            .from('pvi_previsao_itens')
            .select(
              'pvi_valor, pvi_ctr_id, pvi_ban_id, ctr_contas_receita(ctr_nome, ctr_codigo), ban_bancos(ban_id, ban_nome, ban_codigo), tpr_tipos_receita(tpr_id, tpr_nome, tpr_codigo)',
            )
            .eq('pvi_tipo', 'receita')
            .eq('pvi_data', data),
          supabase
            .from('cob_cobrancas')
            .select('cob_valor, cob_ctr_id, cob_ban_id, ctr_contas_receita(ctr_nome, ctr_codigo), ban_bancos(ban_id, ban_nome, ban_codigo), tpr_tipos_receita(tpr_id, tpr_nome, tpr_codigo)')
            .eq('cob_data', data),
        ]);

        if (previsoesRes.error) throw previsoesRes.error;
        if (cobrancasRes.error) throw cobrancasRes.error;

        const previsoes = normalizeRelation(previsoesRes.data as MaybeArray<PrevisaoRow>);
        const cobrancas = normalizeRelation(cobrancasRes.data as MaybeArray<CobrancaRow>);

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

          const bancoRel = normalizeRelation(item.ban_bancos)[0];
          const bancoNome = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
          // Prioriza o ban_id do registro relacionado, depois usa pvi_ban_id
          const bancoIdNumero = bancoRel?.ban_id ? toNumber(bancoRel.ban_id) : toNumber(item.pvi_ban_id, NaN);
          const bancoChave = construirChave(bancoIdNumero, bancoNome, 'banco');

          const tipoRel = normalizeRelation(item.tpr_tipos_receita)[0];
          const tipoNome = tipoRel?.tpr_nome ? toString(tipoRel.tpr_nome) : contaNome;
          const tipoIdNumero = toNumber(tipoRel?.tpr_id, NaN);
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

          const bancoRel = normalizeRelation(item.ban_bancos)[0];
          const bancoNome = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
          // Prioriza o ban_id do registro relacionado, depois usa cob_ban_id
          const bancoIdNumero = bancoRel?.ban_id ? toNumber(bancoRel.ban_id) : toNumber(item.cob_ban_id, NaN);
          const bancoChave = construirChave(bancoIdNumero, bancoNome, 'banco');

          const tipoRel = normalizeRelation(item.tpr_tipos_receita)[0];
          const tipoNome = tipoRel?.tpr_nome ? toString(tipoRel.tpr_nome) : contaNome;
          const tipoIdNumero = toNumber(tipoRel?.tpr_id, NaN);
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

        const bancosMap = new Map<string, BancoAcumulado>();

        contasMap.forEach((conta) => {
          if (conta.previsto === 0 && conta.realizado === 0) {
            return;
          }

          const banco = bancosMap.get(conta.bancoId) ?? {
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
          bancosMap.set(conta.bancoId, banco);
        });

        const bancos: BancoResumo[] = Array.from(bancosMap.entries())
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
          titulos: { receitaPrevista: number; outrasReceitas: number };
          depositos: { receitaPrevista: number; outrasReceitas: number };
        };

        const bancosCategorizadosMap = new Map<string, BancoCategoriaAcumulado>();

        contasMap.forEach((conta) => {
          const contaCodigo = toString(conta.contaNome).toUpperCase();
          const contaNome = toString(conta.contaNome).toUpperCase();

          // Identificar se é Títulos ou Depósitos
          const ehTitulos = contaNome.includes('TÍTULO') || contaNome.includes('TITULO') || contaCodigo.startsWith('301');
          const ehDepositos = contaNome.includes('DEPÓSITO') || contaNome.includes('DEPOSITO') || contaCodigo.startsWith('302') || contaCodigo.startsWith('303');

          if (!ehTitulos && !ehDepositos) {
            return; // Ignora contas que não são Títulos nem Depósitos
          }

          const banco = bancosCategorizadosMap.get(conta.bancoId) ?? {
            nome: conta.bancoNome,
            titulos: { receitaPrevista: 0, outrasReceitas: 0 },
            depositos: { receitaPrevista: 0, outrasReceitas: 0 },
          };

          // Identificar se é Receita Prevista ou Outras Receitas
          const tipoNomeUpper = toString(conta.tipoNome).toUpperCase();
          const ehReceitaPrevista = tipoNomeUpper.includes('PREVIS') || tipoNomeUpper.includes('301');

          if (ehTitulos) {
            if (ehReceitaPrevista) {
              banco.titulos.receitaPrevista += conta.realizado; // Usar realizado pois é o que foi cobrado
            } else {
              banco.titulos.outrasReceitas += conta.realizado;
            }
          } else if (ehDepositos) {
            if (ehReceitaPrevista) {
              banco.depositos.receitaPrevista += conta.realizado;
            } else {
              banco.depositos.outrasReceitas += conta.realizado;
            }
          }

          bancosCategorizadosMap.set(conta.bancoId, banco);
        });

        const bancosCategorizado: BancoCategorizado[] = Array.from(bancosCategorizadosMap.entries())
          .map(([id, banco]) => ({
            id,
            nome: banco.nome,
            titulos: {
              receitaPrevista: arredondar(banco.titulos.receitaPrevista),
              outrasReceitas: arredondar(banco.titulos.outrasReceitas),
              total: arredondar(banco.titulos.receitaPrevista + banco.titulos.outrasReceitas),
            },
            depositos: {
              receitaPrevista: arredondar(banco.depositos.receitaPrevista),
              outrasReceitas: arredondar(banco.depositos.outrasReceitas),
              total: arredondar(banco.depositos.receitaPrevista + banco.depositos.outrasReceitas),
            },
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        // Totais consolidados
        const totalPrevisto = arredondar(bancos.reduce((acc, banco) => acc + banco.previsto, 0));
        const totalRealizado = arredondar(bancos.reduce((acc, banco) => acc + banco.realizado, 0));
        const diferenca = arredondar(totalRealizado - totalPrevisto);

        const titulosTotal = arredondar(
          bancosCategorizado.reduce((acc, b) => acc + b.titulos.total, 0)
        );
        const depositosTotal = arredondar(
          bancosCategorizado.reduce((acc, b) => acc + b.depositos.total, 0)
        );
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
            depositosTotal,
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
            {/* Resumo por Banco - Half Width */}
            <div className="lg:w-1/2">
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
            </div>

            {/* Títulos Section */}
            {relatorio.bancosCategorizado.length > 0 && (
              <>
                <div className="mt-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Receitas em Títulos</h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    {relatorio.bancosCategorizado.map((banco) => (
                      <Card key={`titulos-${banco.id}`} title={banco.nome}>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Receita prevista</span>
                            <span className="text-sm font-semibold text-gray-900">
                              {formatCurrency(banco.titulos.receitaPrevista)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Outras receitas</span>
                            <span className="text-sm font-semibold text-gray-900">
                              {formatCurrency(banco.titulos.outrasReceitas)}
                            </span>
                          </div>
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

                {/* Depósitos Section */}
                <div className="mt-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Receitas em Depósitos</h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    {relatorio.bancosCategorizado.map((banco) => (
                      <Card key={`depositos-${banco.id}`} title={banco.nome}>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Receita prevista</span>
                            <span className="text-sm font-semibold text-gray-900">
                              {formatCurrency(banco.depositos.receitaPrevista)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Outras receitas</span>
                            <span className="text-sm font-semibold text-gray-900">
                              {formatCurrency(banco.depositos.outrasReceitas)}
                            </span>
                          </div>
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
              </>
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
