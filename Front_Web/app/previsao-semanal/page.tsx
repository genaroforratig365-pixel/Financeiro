'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading, Table } from '@/components/ui';
import {
  getOrCreateUser,
  getSupabaseClient,
  type UsuarioRow,
} from '@/lib/supabaseClient';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';
import { getUserSession } from '@/lib/userSession';
import { formatCurrency } from '@/lib/mathParser';

type Mensagem = { tipo: 'sucesso' | 'erro' | 'info'; texto: string };

type SemanaOpcao = {
  id: string;
  label: string;
  inicio: string;
  fim: string;
  bloqueada: boolean;
};

type PrevisaoTipo = 'RECEITA' | 'DESPESA' | 'SALDO_INICIAL';

type PrevisaoItem = {
  id: string;
  categoria: string;
  tipo: PrevisaoTipo;
  data: string;
  valor: string;
  incluir: boolean;
  codigo?: string;
  contaId?: number | null;
  areaId?: number | null;
  referencia?: string;
};

type PrevisaoResumoDia = {
  data: string;
  receitas: number;
  despesas: number;
  saldoInicial: number;
  saldoDiario: number;
  saldoAcumulado: number;
};

type ContaResumo = { id: number; nome: string };
type AreaResumo = { id: number; nome: string };

type PrevisaoRegistroRow = {
  psw_id?: unknown;
  psw_categoria?: unknown;
  psw_tipo?: unknown;
  psw_data?: unknown;
  psw_valor?: unknown;
  psw_codigo?: unknown;
  psw_are_id?: unknown;
  psw_ctr_id?: unknown;
  psw_observacao?: unknown;
};

const normalizarTexto = (valor: string): string =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const CODIGOS_RECEITA: Record<string, string> = {
  'DEPOSITO E PIX': '201',
  'DEPOSITO EPIX': '201',
  'DEPOSITO PIX': '201',
  'DEPOSITO EPIX ': '201',
  'DEPOSITO E PIX ': '201',
  'BOLETO': '200',
  'BOLETOS': '200',
  'ANTECIPADO': '201',
  'CARTAO DEBITO': '202',
  'CARTAO DEBITO VAREJO': '202',
  'A VISTA': '202',
  'A VISTA VAREJO': '202',
};

const formatarDataCurta = (iso: string): string => {
  if (!iso) return '—';
  const data = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(data.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(data);
};

const gerarDatasSemana = (inicioIso: string): string[] => {
  if (!inicioIso) return [];
  const inicio = new Date(`${inicioIso}T00:00:00`);
  return Array.from({ length: 5 }, (_, indice) => {
    const data = new Date(inicio);
    data.setDate(inicio.getDate() + indice);
    return data.toISOString().split('T')[0];
  });
};

const gerarOpcoesSemana = (): SemanaOpcao[] => {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segundaAtual = new Date(hoje);
  segundaAtual.setHours(0, 0, 0, 0);
  segundaAtual.setDate(hoje.getDate() + diff);

  return Array.from({ length: 6 }, (_, indice) => {
    const inicio = new Date(segundaAtual);
    inicio.setDate(segundaAtual.getDate() + indice * 7);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 4);

    const inicioIso = inicio.toISOString().split('T')[0];
    const fimIso = fim.toISOString().split('T')[0];

    return {
      id: inicioIso,
      label: `Semana ${formatarDataCurta(inicioIso)} - ${formatarDataCurta(fimIso)}`,
      inicio: inicioIso,
      fim: fimIso,
      bloqueada: indice === 0,
    };
  });
};

const formatarValorParaCampo = (valor: number): string => {
  if (!Number.isFinite(valor)) {
    return '';
  }
  return valor.toFixed(2).replace('.', ',');
};

const parseValor = (valor: string | number | null | undefined): number => {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return 0;
    return Math.round(valor * 100) / 100;
  }

  if (!valor) {
    return 0;
  }

  const normalizado = String(valor)
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');

  const parsed = Number(normalizado);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.round(parsed * 100) / 100;
};

const mapTipoLabel = (tipo: PrevisaoTipo): string => {
  switch (tipo) {
    case 'RECEITA':
      return 'Receita';
    case 'DESPESA':
      return 'Despesa';
    case 'SALDO_INICIAL':
      return 'Saldo inicial';
    default:
      return tipo;
  }
};

const toString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
};

export default function PrevisaoSemanalPage() {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [semanas, setSemanas] = useState<SemanaOpcao[]>([]);
  const [semanaSelecionada, setSemanaSelecionada] = useState<string>('');
  const [datasSemana, setDatasSemana] = useState<string[]>([]);
  const [previsaoItens, setPrevisaoItens] = useState<PrevisaoItem[]>([]);
  const [contasPorCodigo, setContasPorCodigo] = useState<Record<string, ContaResumo>>({});
  const [areasPorNome, setAreasPorNome] = useState<Record<string, AreaResumo>>({});
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [processandoArquivo, setProcessandoArquivo] = useState(false);
  const [carregandoPrevisao, setCarregandoPrevisao] = useState(false);
  const [processandoImportacao, setProcessandoImportacao] = useState(false);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);

  const inputArquivoRef = useRef<HTMLInputElement | null>(null);

  const semanaBloqueada = useMemo(() => {
    if (!semanaSelecionada) return true;
    return semanas.find((semana) => semana.id === semanaSelecionada)?.bloqueada ?? true;
  }, [semanaSelecionada, semanas]);

  const resumoDias = useMemo<PrevisaoResumoDia[]>(() => {
    if (datasSemana.length === 0) {
      return [];
    }

    let saldoDiarioAnterior = 0;
    let saldoAcumuladoAnterior = 0;

    return datasSemana.map((data, indice) => {
      const itensDia = previsaoItens.filter((item) => item.incluir && item.data === data);
      const receitas = itensDia
        .filter((item) => item.tipo === 'RECEITA')
        .reduce((acc, item) => acc + parseValor(item.valor), 0);
      const despesas = itensDia
        .filter((item) => item.tipo === 'DESPESA')
        .reduce((acc, item) => acc + parseValor(item.valor), 0);
      const saldoInicialItem = itensDia.find((item) => item.tipo === 'SALDO_INICIAL');
      const saldoInicial = saldoInicialItem ? parseValor(saldoInicialItem.valor) : saldoDiarioAnterior;
      const saldoDiario = (indice === 0 ? saldoInicial : saldoDiarioAnterior) + receitas - despesas;
      const saldoAcumulado = indice === 0 ? saldoDiario : saldoAcumuladoAnterior + receitas - despesas;

      saldoDiarioAnterior = saldoDiario;
      saldoAcumuladoAnterior = saldoAcumulado;

      return {
        data,
        receitas,
        despesas,
        saldoInicial: indice === 0 ? saldoInicial : saldoDiarioAnterior - receitas + despesas,
        saldoDiario,
        saldoAcumulado,
      };
    });
  }, [datasSemana, previsaoItens]);

  const carregarBase = useCallback(async () => {
    try {
      setCarregando(true);
      const supabase = getSupabaseClient();
      const { userId, userName, userEmail } = getUserSession();
      const { data: usuarioEncontrado, error: usuarioErro } = await getOrCreateUser(
        supabase,
        userId,
        userName ?? undefined,
        userEmail ?? undefined
      );

      if (usuarioErro) throw usuarioErro;
      if (!usuarioEncontrado) {
        setMensagem({
          tipo: 'erro',
          texto: 'Selecione um operador antes de acessar a previsão semanal.',
        });
        return;
      }

      setUsuario(usuarioEncontrado);

      const semanasDisponiveis = gerarOpcoesSemana();
      setSemanas(semanasDisponiveis);
      const semanaPadrao = semanasDisponiveis.find((semana) => !semana.bloqueada) ?? semanasDisponiveis[0];
      setSemanaSelecionada(semanaPadrao?.id ?? '');
      setDatasSemana(gerarDatasSemana(semanaPadrao?.id ?? ''));

      const [contasRes, areasRes] = await Promise.all([
        supabase
          .from('ctr_contas_receita')
          .select('ctr_id, ctr_nome, ctr_codigo')
          .eq('ctr_ativo', true),
        supabase
          .from('are_areas')
          .select('are_id, are_nome')
          .eq('are_ativo', true),
      ]);

      if (contasRes.error) throw contasRes.error;
      if (areasRes.error) throw areasRes.error;

      const contasMapa = (contasRes.data ?? []).reduce<Record<string, ContaResumo>>((acc, conta) => {
        const codigo = normalizarTexto(toString(conta.ctr_codigo));
        if (codigo) {
          acc[codigo] = {
            id: Number(conta.ctr_id),
            nome: toString(conta.ctr_nome, 'Conta sem nome'),
          };
        }
        return acc;
      }, {});

      const areasMapa = (areasRes.data ?? []).reduce<Record<string, AreaResumo>>((acc, area) => {
        const chave = normalizarTexto(toString(area.are_nome));
        if (chave) {
          acc[chave] = {
            id: Number(area.are_id),
            nome: toString(area.are_nome, 'Área sem nome'),
          };
        }
        return acc;
      }, {});

      setContasPorCodigo(contasMapa);
      setAreasPorNome(areasMapa);
    } catch (error) {
      console.error('Erro ao carregar dados da previsão semanal:', error);
      setMensagem({
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível carregar as configurações iniciais. Recarregue a página e tente novamente.'
        ),
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  const carregarPrevisaoExistente = useCallback(async () => {
    if (!usuario || !semanaSelecionada) {
      return;
    }

    try {
      setCarregandoPrevisao(true);
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pvw_previsao_semana')
        .select('*')
        .eq('psw_usr_id', usuario.usr_id)
        .eq('psw_semana_inicio', semanaSelecionada)
        .order('psw_data', { ascending: true })
        .order('psw_categoria', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        setPrevisaoItens([]);
        setDatasSemana(gerarDatasSemana(semanaSelecionada));
        setArquivoNome(null);
        return;
      }

      const itens: PrevisaoItem[] = data.map((row: PrevisaoRegistroRow) => {
        const tipoBanco = normalizarTexto(toString(row.psw_tipo));
        const categoria = toString(row.psw_categoria, 'Categoria não informada');
        const tipo: PrevisaoTipo = tipoBanco === 'SALDO' ? 'SALDO_INICIAL' : (tipoBanco as PrevisaoTipo);
        const valorNumero = parseValor(row.psw_valor as number | string | null | undefined);
        const codigo = toString(row.psw_codigo) || undefined;
        const referencia = toString(row.psw_observacao) || undefined;

        return {
          id: `${categoria}-${row.psw_data}-${row.psw_id ?? Math.random()}`,
          categoria,
          tipo,
          data: toString(row.psw_data),
          valor: formatarValorParaCampo(valorNumero),
          incluir: true,
          codigo,
          contaId: row.psw_ctr_id ? Number(row.psw_ctr_id) : undefined,
          areaId: row.psw_are_id ? Number(row.psw_are_id) : undefined,
          referencia,
        };
      });

      const datas = Array.from(
        new Set(itens.map((item) => item.data).filter((data) => data))
      ).sort();

      setPrevisaoItens(itens);
      setDatasSemana(datas.length > 0 ? datas : gerarDatasSemana(semanaSelecionada));
      setArquivoNome(null);
    } catch (error) {
      console.error('Erro ao carregar previsão existente:', error);
      setMensagem({
        tipo: 'erro',
        texto: traduzirErroSupabase(error, 'Não foi possível carregar a previsão desta semana.'),
      });
    } finally {
      setCarregandoPrevisao(false);
    }
  }, [semanaSelecionada, usuario]);

  useEffect(() => {
    carregarPrevisaoExistente();
  }, [carregarPrevisaoExistente]);

  const interpretarPlanilha = useCallback(
    async (arquivo: File) => {
      try {
        setProcessandoArquivo(true);
        const modulo = await import(
          /* webpackIgnore: true */ 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs'
        );
        const buffer = await arquivo.arrayBuffer();
        const workbook = modulo.read(buffer, { type: 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('A planilha não possui abas.');
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const linhas = modulo.utils.sheet_to_json(sheet, {
          header: 1,
          raw: true,
        }) as (string | number | null)[][];

        if (!linhas || linhas.length === 0) {
          throw new Error('Não foi possível ler os dados da planilha.');
        }

        let indiceCabecalho = -1;
        let colunasDatas: { indice: number; data: string }[] = [];

        for (let i = 0; i < linhas.length; i += 1) {
          const linha = linhas[i];
          const datas = linha
            .map((valor, indice) => {
              const dataIso = (() => {
                if (valor === null || valor === undefined || valor === '') {
                  return null;
                }
                if (typeof valor === 'number') {
                  const parsed = modulo.SSF.parse_date_code(valor);
                  if (!parsed) return null;
                  const data = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
                  return data.toISOString().split('T')[0];
                }
                const texto = String(valor).trim();
                if (!texto) return null;
                const partes = texto.split(/[\/]/);
                if (partes.length === 3) {
                  const [dia, mes, ano] = partes.map((parte) => Number(parte));
                  if (Number.isFinite(dia) && Number.isFinite(mes) && Number.isFinite(ano)) {
                    const data = new Date(ano, mes - 1, dia);
                    if (!Number.isNaN(data.getTime())) {
                      return data.toISOString().split('T')[0];
                    }
                  }
                }
                const data = new Date(texto);
                if (!Number.isNaN(data.getTime())) {
                  return new Date(data.getTime() - data.getTimezoneOffset() * 60000)
                    .toISOString()
                    .split('T')[0];
                }
                return null;
              })();

              return dataIso ? { indice, data: dataIso } : null;
            })
            .filter((item): item is { indice: number; data: string } => item !== null);

          if (datas.length >= 2) {
            indiceCabecalho = i;
            colunasDatas = datas;
            break;
          }
        }

        if (indiceCabecalho === -1) {
          throw new Error('Não foi possível identificar as datas na planilha.');
        }

        const itens: PrevisaoItem[] = [];

        linhas.slice(indiceCabecalho + 1).forEach((linha) => {
          const descricaoBruta = toString(linha[0]).trim();
          if (!descricaoBruta) {
            return;
          }

          const descricaoNormalizada = normalizarTexto(descricaoBruta);
          if (descricaoNormalizada === 'RECEITAS') {
            return;
          }
          if (
            descricaoNormalizada.startsWith('SALDO ') &&
            !descricaoNormalizada.startsWith('SALDO INICIAL')
          ) {
            return;
          }

          const tipo: PrevisaoTipo = descricaoNormalizada.startsWith('GASTO ')
            ? 'DESPESA'
            : descricaoNormalizada.includes('SALDO INICIAL')
            ? 'SALDO_INICIAL'
            : 'RECEITA';

          colunasDatas.forEach(({ indice, data }, colunaIndice) => {
            const bruto = linha[indice];
            const valorNumerico = parseValor(bruto as number | string | null | undefined);

            if (tipo === 'SALDO_INICIAL' && colunaIndice > 0) {
              return;
            }

            if (tipo !== 'SALDO_INICIAL' && valorNumerico === 0) {
              return;
            }

            let codigo: string | undefined;
            let contaId: number | undefined;
            let areaId: number | undefined;
            let referencia: string | undefined;

            if (tipo === 'RECEITA') {
              const codigoMapeado = CODIGOS_RECEITA[descricaoNormalizada];
              if (codigoMapeado) {
                const conta = contasPorCodigo[codigoMapeado];
                codigo = codigoMapeado;
                if (conta) {
                  contaId = conta.id;
                  referencia = conta.nome;
                } else {
                  referencia = `Conta com código ${codigoMapeado} não encontrada`;
                }
              }
            }

            if (tipo === 'DESPESA' && descricaoNormalizada.startsWith('GASTO ')) {
              const areaNome = descricaoBruta.replace(/^[Gg][Aa][Ss][Tt][Oo]\s+/u, '').trim();
              const areaChave = normalizarTexto(areaNome);
              const area = areasPorNome[areaChave];
              areaId = area?.id;
              referencia = area ? area.nome : areaNome || 'Área não localizada';
            }

            if (tipo === 'SALDO_INICIAL') {
              referencia = 'Saldo inicial da semana';
            }

            itens.push({
              id: `${descricaoNormalizada}-${data}-${indice}`,
              categoria: descricaoBruta,
              tipo,
              data,
              valor: formatarValorParaCampo(valorNumerico),
              incluir: true,
              codigo,
              contaId,
              areaId,
              referencia,
            });
          });
        });

        const datasOrdenadas = colunasDatas.map((coluna) => coluna.data);
        setPrevisaoItens(itens);
        setDatasSemana(datasOrdenadas.length > 0 ? datasOrdenadas : gerarDatasSemana(semanaSelecionada));
        setArquivoNome(arquivo.name);
        setMensagem({
          tipo: 'sucesso',
          texto: `Arquivo "${arquivo.name}" processado com sucesso. Revise os valores antes de importar.`,
        });
      } catch (error) {
        console.error('Erro ao interpretar planilha de previsão semanal:', error);
        setMensagem({
          tipo: 'erro',
          texto:
            error instanceof Error
              ? error.message
              : 'Não foi possível processar o arquivo selecionado. Tente novamente.',
        });
      } finally {
        setProcessandoArquivo(false);
      }
    },
    [areasPorNome, contasPorCodigo, semanaSelecionada]
  );

  const atualizarItem = useCallback((id: string, patch: Partial<PrevisaoItem>) => {
    setPrevisaoItens((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const handleArquivoSelecionado = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    if (!arquivo) {
      return;
    }

    await interpretarPlanilha(arquivo);
    event.target.value = '';
  };

  const handleImportar = async () => {
    if (!usuario || !semanaSelecionada) {
      return;
    }

    const registros = previsaoItens
      .filter((item) => item.incluir)
      .map((item) => ({
        psw_semana_inicio: semanaSelecionada,
        psw_data: item.data,
        psw_categoria: item.categoria,
        psw_tipo: item.tipo === 'SALDO_INICIAL' ? 'SALDO' : item.tipo,
        psw_valor: parseValor(item.valor),
        psw_codigo: item.codigo ?? null,
        psw_are_id: item.areaId ?? null,
        psw_ctr_id: item.contaId ?? null,
        psw_observacao: item.referencia ?? null,
      }));

    try {
      setProcessandoImportacao(true);
      setMensagem(null);
      const supabase = getSupabaseClient();

      const { error: deleteErr } = await supabase
        .from('pvw_previsao_semana')
        .delete()
        .eq('psw_semana_inicio', semanaSelecionada)
        .eq('psw_usr_id', usuario.usr_id);

      if (deleteErr) throw deleteErr;

      if (registros.length > 0) {
        const { error: insertErr } = await supabase.from('pvw_previsao_semana').insert(registros);
        if (insertErr) throw insertErr;
      }

      setMensagem({
        tipo: 'sucesso',
        texto:
          registros.length === 0
            ? 'Nenhum dado foi importado para a semana selecionada.'
            : 'Previsão semanal importada com sucesso.',
      });
      await carregarPrevisaoExistente();
    } catch (error) {
      console.error('Erro ao importar previsão semanal:', error);
      setMensagem({
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível salvar a previsão semanal. Revise os dados e tente novamente.'
        ),
      });
    } finally {
      setProcessandoImportacao(false);
    }
  };

  const itensSelecionados = previsaoItens.filter((item) => item.incluir).length;

  const handleImportarClick = async () => {
    if (semanaBloqueada) {
      setMensagem({
        tipo: 'info',
        texto: 'A semana atual está bloqueada para importação. Selecione uma semana futura para continuar.',
      });
      return;
    }

    await handleImportar();
  };

  if (carregando) {
    return (
      <>
        <Header title="Previsão Semanal" />
        <div className="page-content flex h-96 items-center justify-center">
          <Loading size="lg" text="Carregando configurações..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Previsão Semanal"
        subtitle="Importe a planilha semanal, ajuste os valores e registre apenas o que desejar aplicar"
      />

      <div className="page-content space-y-6">
        {mensagem && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              mensagem.tipo === 'sucesso'
                ? 'border-success-200 bg-success-50 text-success-700'
                : mensagem.tipo === 'erro'
                ? 'border-error-200 bg-error-50 text-error-700'
                : 'border-primary-200 bg-primary-50 text-primary-800'
            }`}
          >
            {mensagem.texto}
          </div>
        )}

        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Selecione a semana de trabalho</h2>
              <p className="text-sm text-gray-600">
                A edição está disponível apenas para semanas futuras. A semana corrente é exibida apenas para consulta.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <label htmlFor="semana" className="text-sm font-medium text-gray-700">
                Semana
              </label>
              <select
                id="semana"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={semanaSelecionada}
                onChange={(event) => {
                  setSemanaSelecionada(event.target.value);
                  setPrevisaoItens([]);
                  setArquivoNome(null);
                  setDatasSemana(gerarDatasSemana(event.target.value));
                }}
              >
                {semanas.map((semana) => (
                  <option key={semana.id} value={semana.id}>
                    {semana.label}
                    {semana.bloqueada ? ' (somente leitura)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              {arquivoNome ? (
                <span>
                  Arquivo carregado: <strong>{arquivoNome}</strong>
                </span>
              ) : (
                <span>Nenhum arquivo importado até o momento.</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={inputArquivoRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleArquivoSelecionado}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => inputArquivoRef.current?.click()}
                disabled={processandoArquivo}
              >
                {processandoArquivo ? 'Processando...' : 'Importar planilha Excel'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPrevisaoItens([]);
                  setArquivoNome(null);
                  setMensagem(null);
                }}
                disabled={previsaoItens.length === 0}
              >
                Limpar itens
              </Button>
            </div>
          </div>

          {semanaBloqueada && (
            <div className="mt-4 rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
              A semana selecionada está bloqueada para edições. Carregue o arquivo apenas para visualizar ou selecione a próxima
              semana para realizar ajustes.
            </div>
          )}
        </Card>

        <Card title="Pré-visualização dos lançamentos" subtitle="Marque apenas os itens que deseja importar para o Supabase">
          {carregandoPrevisao ? (
            <div className="py-8">
              <Loading text="Carregando dados já importados..." />
            </div>
          ) : previsaoItens.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              Nenhum dado carregado. Importe uma planilha ou utilize uma semana com dados previamente registrados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Incluir</th>
                    <th className="px-4 py-3 text-left">Data</th>
                    <th className="px-4 py-3 text-left">Categoria</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">Referência</th>
                    <th className="px-4 py-3 text-left">Valor</th>
                    <th className="px-4 py-3 text-left">Código</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white/80">
                  {previsaoItens.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          checked={item.incluir}
                          disabled={semanaBloqueada}
                          onChange={() => atualizarItem(item.id, { incluir: !item.incluir })}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatarDataCurta(item.data)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{item.categoria}</td>
                      <td className="px-4 py-3 text-gray-700">{mapTipoLabel(item.tipo)}</td>
                      <td className="px-4 py-3 text-gray-600">{item.referencia ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={item.valor}
                          disabled={semanaBloqueada}
                          onChange={(event) => atualizarItem(item.id, { valor: event.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.codigo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              {itensSelecionados} itens selecionados para importação de um total de {previsaoItens.length} registros carregados.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={handleImportarClick}
                loading={processandoImportacao}
                disabled={semanaBloqueada || processandoImportacao || previsaoItens.length === 0}
              >
                Salvar previsão
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Resumo por dia" subtitle="Visualize o impacto diário após considerar os itens selecionados">
          {resumoDias.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              Nenhuma data disponível para esta semana. Importe uma planilha para calcular os totais.
            </div>
          ) : (
            <Table
              columns={[
                {
                  key: 'data',
                  label: 'Data',
                  render: (item: PrevisaoResumoDia) => formatarDataCurta(item.data),
                  sortable: true,
                },
                {
                  key: 'saldoInicial',
                  label: 'Saldo inicial',
                  render: (item: PrevisaoResumoDia) => formatCurrency(item.saldoInicial),
                },
                {
                  key: 'receitas',
                  label: 'Receitas',
                  render: (item: PrevisaoResumoDia) => formatCurrency(item.receitas),
                },
                {
                  key: 'despesas',
                  label: 'Despesas',
                  render: (item: PrevisaoResumoDia) => formatCurrency(item.despesas),
                },
                {
                  key: 'saldoDiario',
                  label: 'Saldo diário',
                  render: (item: PrevisaoResumoDia) => formatCurrency(item.saldoDiario),
                },
                {
                  key: 'saldoAcumulado',
                  label: 'Saldo acumulado',
                  render: (item: PrevisaoResumoDia) => formatCurrency(item.saldoAcumulado),
                },
              ]}
              data={resumoDias}
              keyExtractor={(item) => item.data}
              emptyMessage="Sem valores calculados para a semana."
            />
          )}
        </Card>
      </div>
    </>
  );
}
