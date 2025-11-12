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

const adicionarDias = (date: Date, dias: number): Date => {
  const nova = new Date(date);
  nova.setDate(nova.getDate() + dias);
  return nova;
};

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

type MaybeArray<T> = T | T[] | null | undefined;

type PrevisaoCobrancaRow = {
  pvi_data?: unknown;
  pvi_valor?: unknown;
  pvi_ctr_id?: unknown;
  pvi_ban_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
};

type RecebimentoRow = {
  rec_data?: unknown;
  rec_valor?: unknown;
  rec_ctr_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
};

type ItemDiaCobranca = {
  chave: string;
  conta: string;
  banco: string;
  previsto: number;
  realizado: number;
  diferenca: number;
};

type DiaCobranca = {
  data: string;
  itens: ItemDiaCobranca[];
  totalPrevisto: number;
  totalRealizado: number;
  diferenca: number;
};

type RelatorioCobranca = {
  dataInicio: string;
  dataFim: string;
  dias: DiaCobranca[];
  resumo: {
    totalPrevisto: number;
    totalRealizado: number;
    diferenca: number;
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

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

const gerarIntervaloDatas = (inicio: string, fim: string): string[] => {
  if (!inicio) {
    return [];
  }

  const datas: string[] = [];
  const dataInicio = new Date(`${inicio}T00:00:00`);
  const dataFim = fim ? new Date(`${fim}T00:00:00`) : dataInicio;

  const atual = new Date(dataInicio);
  while (atual <= dataFim) {
    datas.push(toISODate(atual));
    atual.setDate(atual.getDate() + 1);
  }

  return datas;
};

const construirChaveConta = (id: number, nome: string): string => {
  if (Number.isFinite(id) && id !== 0) {
    return `conta-${id}`;
  }
  return `conta-${nome.trim().toLowerCase() || 'sem-identificacao'}`;
};

const RelatorioCobrancaPage: React.FC = () => {
  const hoje = useMemo(() => new Date(), []);
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregandoUsuario, setCarregandoUsuario] = useState(true);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dataInicio, setDataInicio] = useState(() => toISODate(adicionarDias(hoje, -1)));
  const [dataFim, setDataFim] = useState(() => toISODate(adicionarDias(hoje, 5)));
  const [relatorio, setRelatorio] = useState<RelatorioCobranca | null>(null);

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
    async (inicio: string, fim: string) => {
      if (!usuario) {
        return;
      }

      try {
        setCarregandoDados(true);
        const supabase = getSupabaseClient();

        const [previsoesRes, recebimentosRes] = await Promise.all([
          supabase
            .from('pvi_previsao_itens')
            .select(
              'pvi_data, pvi_valor, pvi_ctr_id, pvi_ban_id, ctr_contas_receita(ctr_nome, ctr_codigo), ban_bancos(ban_nome)',
            )
            .eq('pvi_tipo', 'receita')
            .gte('pvi_data', inicio)
            .lte('pvi_data', fim),
          supabase
            .from('rec_receitas')
            .select('rec_data, rec_valor, rec_ctr_id, ctr_contas_receita(ctr_nome, ctr_codigo)')
            .gte('rec_data', inicio)
            .lte('rec_data', fim),
        ]);

        if (previsoesRes.error) throw previsoesRes.error;
        if (recebimentosRes.error) throw recebimentosRes.error;

        const previsoes = normalizeRelation(previsoesRes.data as MaybeArray<PrevisaoCobrancaRow>);
        const recebimentos = normalizeRelation(recebimentosRes.data as MaybeArray<RecebimentoRow>);

        const datasIntervalo = gerarIntervaloDatas(inicio, fim);
        const mapaDias = new Map<string, Map<string, { conta: string; banco: string; previsto: number; realizado: number }>>();

        datasIntervalo.forEach((data) => {
          mapaDias.set(data, new Map());
        });

        previsoes.forEach((item) => {
          const data = toString(item.pvi_data);
          if (!data) return;

          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const bancoRel = normalizeRelation(item.ban_bancos)[0];
          const contaNome = contaRel?.ctr_nome ? toString(contaRel.ctr_nome) : 'Conta não informada';
          const bancoNome = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
          const contaId = toNumber(item.pvi_ctr_id, 0);
          const chave = construirChaveConta(contaId, contaNome);
          const valor = arredondar(toNumber(item.pvi_valor));

          const mapaDia = mapaDias.get(data) ?? new Map();
          const existente = mapaDia.get(chave) ?? {
            conta: contaNome,
            banco: bancoNome,
            previsto: 0,
            realizado: 0,
          };

          existente.conta = contaNome;
          existente.banco = bancoNome;
          existente.previsto += valor;
          mapaDia.set(chave, existente);
          mapaDias.set(data, mapaDia);
        });

        recebimentos.forEach((item) => {
          const data = toString(item.rec_data);
          if (!data) return;

          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const contaNome = contaRel?.ctr_nome ? toString(contaRel.ctr_nome) : 'Conta não informada';
          const contaId = toNumber(item.rec_ctr_id, 0);
          const chave = construirChaveConta(contaId, contaNome);
          const valor = arredondar(toNumber(item.rec_valor));

          const mapaDia = mapaDias.get(data) ?? new Map();
          const existente = mapaDia.get(chave) ?? {
            conta: contaNome,
            banco: 'Banco não informado',
            previsto: 0,
            realizado: 0,
          };

          existente.conta = contaNome;
          existente.realizado += valor;
          mapaDia.set(chave, existente);
          mapaDias.set(data, mapaDia);
        });

        const dias: DiaCobranca[] = Array.from(mapaDias.entries())
          .map(([data, itensMapa]) => {
            const itens = Array.from(itensMapa.values()).map((item) => ({
              chave: construirChaveConta(0, `${item.conta}-${item.banco}`),
              conta: item.conta,
              banco: item.banco,
              previsto: arredondar(item.previsto),
              realizado: arredondar(item.realizado),
              diferenca: arredondar(item.realizado - item.previsto),
            }));

            itens.sort((a, b) => {
              if (Math.abs(b.realizado - a.realizado) > 0.009) {
                return b.realizado - a.realizado;
              }
              return a.conta.localeCompare(b.conta, 'pt-BR');
            });

            const totalPrevisto = arredondar(itens.reduce((acc, item) => acc + item.previsto, 0));
            const totalRealizado = arredondar(itens.reduce((acc, item) => acc + item.realizado, 0));
            const diferenca = arredondar(totalRealizado - totalPrevisto);

            return {
              data,
              itens,
              totalPrevisto,
              totalRealizado,
              diferenca,
            };
          })
          .sort((a, b) => a.data.localeCompare(b.data));

        const totalPrevisto = arredondar(dias.reduce((acc, dia) => acc + dia.totalPrevisto, 0));
        const totalRealizado = arredondar(dias.reduce((acc, dia) => acc + dia.totalRealizado, 0));

        setRelatorio({
          dataInicio: inicio,
          dataFim: fim,
          dias,
          resumo: {
            totalPrevisto,
            totalRealizado,
            diferenca: arredondar(totalRealizado - totalPrevisto),
          },
        });
        setErro(null);
      } catch (error) {
        console.error('Erro ao carregar relatório de cobrança:', error);
        setErro(
          traduzirErroSupabase(
            error,
            'Não foi possível gerar o relatório de cobrança para o período selecionado.',
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
    carregarRelatorio(dataInicio, dataFim);
  }, [usuario, dataInicio, dataFim, carregarRelatorio]);

  const gerarDocumentoPdf = useCallback(() => {
    if (!relatorio) {
      return null;
    }

    const doc = new jsPDF('portrait', 'mm', 'a4');
    const margem = 14;
    const larguraUtil = doc.internal.pageSize.getWidth() - margem * 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Relatório - Cobrança', margem, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(
      `Período: ${formatarDataPt(relatorio.dataInicio)} a ${formatarDataPt(relatorio.dataFim)}`,
      margem,
      20,
    );

    const resumoTexto = `Previsto: ${formatCurrency(relatorio.resumo.totalPrevisto)}  |  Realizado: ${formatCurrency(relatorio.resumo.totalRealizado)}  |  Diferença: ${formatCurrency(relatorio.resumo.diferenca)}`;
    doc.setFontSize(9);
    const resumoQuebrado = doc.splitTextToSize(resumoTexto, larguraUtil);
    doc.text(resumoQuebrado, margem, 26);

    let posY = 26 + resumoQuebrado.length * 5;

    const adicionarTabelaDia = (dia: DiaCobranca) => {
      posY += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Recebimentos - ${formatarDataPt(dia.data)}`, margem, posY);

      const cabecalho = [['Banco / Conta', 'Previsto', 'Realizado', 'Diferença']];
      const corpo =
        dia.itens.length === 0
          ? [['Nenhum registro', '-', '-', '-']]
          : dia.itens.map((item) => [
              `${item.banco}\n${item.conta}`,
              formatCurrency(item.previsto),
              formatCurrency(item.realizado),
              formatCurrency(item.diferenca),
            ]);

      const rodape = dia.itens.length > 0
        ? [[
            'Totais do dia',
            formatCurrency(dia.totalPrevisto),
            formatCurrency(dia.totalRealizado),
            formatCurrency(dia.diferenca),
          ]]
        : undefined;

      autoTable(doc, {
        startY: posY + 2,
        head: cabecalho,
        body: corpo,
        foot: rodape,
        styles: { fontSize: 8, cellPadding: 2, halign: 'right' },
        headStyles: { fillColor: [31, 73, 125], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { halign: 'right' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { halign: 'left' } },
        footStyles: { fontStyle: 'bold', fillColor: [237, 242, 247] },
        margin: { left: margem, right: margem },
        didDrawCell: (data) => {
          if (data.column.index === 0 && typeof data.cell.text[0] === 'string' && data.cell.text[0].includes('\n')) {
            data.cell.text = data.cell.text[0].split('\n');
          }
        },
      });

      posY = (doc as any).lastAutoTable.finalY;
    };

    relatorio.dias.forEach((dia, index) => {
      if (index > 0 && posY > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        posY = 20;
      }
      adicionarTabelaDia(dia);
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

    const nomeArquivo = `Relatorio_Cobranca_${relatorio.dataInicio.replace(/-/g, '')}_${relatorio.dataFim.replace(/-/g, '')}.pdf`;
    doc.save(nomeArquivo);
  }, [gerarDocumentoPdf, relatorio]);

  const handleAbrirModalEmail = () => {
    setFeedbackEmail(null);
    if (!emailDestino && usuario?.usr_email) {
      setEmailDestino(usuario.usr_email);
    }
    setEmailModalAberto(true);
  };

  const handleEnviarEmail = async (event: React.FormEvent<HTMLFormElement>) => {
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

      const nomeArquivo = `Relatorio_Cobranca_${relatorio.dataInicio.replace(/-/g, '')}_${relatorio.dataFim.replace(/-/g, '')}.pdf`;
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
          text: emailMensagem || 'Segue relatório de cobrança atualizado.',
        });
        setEmailModalAberto(false);
        return;
      }

      doc.save(nomeArquivo);

      const assunto = encodeURIComponent('Relatório - Cobrança');
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
  };

  const diferencaPeriodoPositiva = relatorio ? relatorio.resumo.diferenca >= 0 : true;

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
        subtitle={`Período: ${formatarDataPt(dataInicio)} a ${formatarDataPt(dataFim)}`}
        actions={
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              type="date"
              label="Data inicial"
              value={dataInicio}
              onChange={(event) => {
                const valor = event.target.value;
                setDataInicio(valor);
                if (valor && valor > dataFim) {
                  setDataFim(valor);
                }
              }}
            />
            <Input
              type="date"
              label="Data final"
              value={dataFim}
              min={dataInicio}
              onChange={(event) => setDataFim(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={handleAbrirModalEmail}
              disabled={!relatorio || carregandoDados}
            >
              Enviar por e-mail
            </Button>
            <Button variant="primary" onClick={handleExportPdf} disabled={!relatorio || carregandoDados}>
              Exportar PDF
            </Button>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <Card variant="danger" title="Não foi possível carregar o relatório">
            <p className="text-sm text-error-700">{erro}</p>
          </Card>
        )}

        {carregandoDados && (
          <div className="flex justify-center">
            <Loading text="Preparando relatório de cobrança..." />
          </div>
        )}

        {relatorio && !carregandoDados && (
          <>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="bg-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                Resumo do Período
              </div>
              <table className="min-w-full text-xs text-gray-600 sm:text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left sm:px-4 sm:py-3">Descrição</th>
                    <th className="px-3 py-2 text-right sm:px-4 sm:py-3">Previsto</th>
                    <th className="px-3 py-2 text-right sm:px-4 sm:py-3">Realizado</th>
                    <th className="px-3 py-2 text-right sm:px-4 sm:py-3">Diferença</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  <tr>
                    <td className="px-3 py-2 text-gray-700 sm:px-4 sm:py-3">Recebimentos do período</td>
                    <td className="px-3 py-2 text-right text-gray-700 sm:px-4 sm:py-3">
                      {formatCurrency(relatorio.resumo.totalPrevisto)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 sm:px-4 sm:py-3">
                      {formatCurrency(relatorio.resumo.totalRealizado)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold sm:px-4 sm:py-3 ${
                        relatorio.resumo.diferenca >= 0 ? 'text-success-600' : 'text-error-600'
                      }`}
                    >
                      {formatCurrency(relatorio.resumo.diferenca)}
                    </td>
                  </tr>
                  <tr
                    className={`${
                      diferencaPeriodoPositiva ? 'bg-success-50 text-success-800' : 'bg-error-50 text-error-800'
                    } font-semibold`}
                  >
                    <td className="px-3 py-2 sm:px-4 sm:py-3" colSpan={3}>
                      Diferença entre realizado e previsto
                    </td>
                    <td className="px-3 py-2 text-right sm:px-4 sm:py-3">
                      {formatCurrency(relatorio.resumo.diferenca)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-5">
              {relatorio.dias.map((dia) => {
                const diferencaPositiva = dia.diferenca >= 0;
                return (
                  <Card
                    key={dia.data}
                    variant="primary"
                    title={`Recebimentos - ${formatarDataPt(dia.data)}`}
                    subtitle={`Diferença no dia: ${formatCurrency(dia.diferenca)}`}
                  >
                    <div className="mb-4 overflow-hidden rounded-lg border border-gray-200">
                      <table className="min-w-full text-xs text-gray-600 sm:text-sm">
                        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">
                          <tr>
                            <th className="px-3 py-2 text-left sm:px-4 sm:py-3">Descrição</th>
                            <th className="px-3 py-2 text-right sm:px-4 sm:py-3">Previsto</th>
                            <th className="px-3 py-2 text-right sm:px-4 sm:py-3">Realizado</th>
                            <th className="px-3 py-2 text-right sm:px-4 sm:py-3">Diferença</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          <tr>
                            <td className="px-3 py-2 text-gray-700 sm:px-4 sm:py-3">Recebimentos do dia</td>
                            <td className="px-3 py-2 text-right text-gray-700 sm:px-4 sm:py-3">
                              {formatCurrency(dia.totalPrevisto)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700 sm:px-4 sm:py-3">
                              {formatCurrency(dia.totalRealizado)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-semibold sm:px-4 sm:py-3 ${
                                diferencaPositiva ? 'text-success-600' : 'text-error-600'
                              }`}
                            >
                              {formatCurrency(dia.diferenca)}
                            </td>
                          </tr>
                          <tr
                            className={`${
                              diferencaPositiva ? 'bg-success-50 text-success-800' : 'bg-error-50 text-error-800'
                            } font-semibold`}
                          >
                            <td className="px-3 py-2 sm:px-4 sm:py-3" colSpan={3}>
                              Diferença entre realizado e previsto
                            </td>
                            <td className="px-3 py-2 text-right sm:px-4 sm:py-3">{formatCurrency(dia.diferenca)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">Banco / Conta</th>
                            <th className="px-4 py-3 text-right font-semibold">Previsto</th>
                            <th className="px-4 py-3 text-right font-semibold">Realizado</th>
                            <th className="px-4 py-3 text-right font-semibold">Diferença</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {dia.itens.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                                Nenhum recebimento registrado para este dia.
                              </td>
                            </tr>
                          ) : (
                            dia.itens.map((item) => (
                              <tr key={item.chave}>
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-800">{item.banco}</div>
                                  <div className="text-xs text-gray-500">{item.conta}</div>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.previsto)}</td>
                                <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.realizado)}</td>
                                <td
                                  className={`px-4 py-3 text-right font-semibold ${
                                    item.diferenca >= 0 ? 'text-success-600' : 'text-error-600'
                                  }`}
                                >
                                  {formatCurrency(item.diferenca)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot className="bg-gray-50 text-sm font-semibold text-gray-700">
                          <tr>
                            <td className="px-4 py-3 text-right">Totais do dia</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(dia.totalPrevisto)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(dia.totalRealizado)}</td>
                            <td
                              className={`px-4 py-3 text-right ${
                                diferencaPositiva ? 'text-success-600' : 'text-error-600'
                              }`}
                            >
                              {formatCurrency(dia.diferenca)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {!relatorio && !carregandoDados && !erro && (
          <Card variant="default" title="Nenhum dado encontrado">
            <p className="text-sm text-gray-600">
              Não localizamos informações para o período selecionado. Ajuste as datas e tente novamente.
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
            O relatório será gerado em PDF. Se o navegador não suportar compartilhamento direto, o arquivo será baixado
            automaticamente para anexar ao e-mail.
          </p>
          {feedbackEmail && <p className="text-sm text-error-600">{feedbackEmail}</p>}
        </form>
      </Modal>
    </>
  );
};

export default RelatorioCobrancaPage;
