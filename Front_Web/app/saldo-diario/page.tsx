
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading } from '@/components/ui';
import {
  getOrCreateUser,
  getSupabaseClient,
  type UsuarioRow,
} from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { evaluateMath, formatCurrency } from '@/lib/mathParser';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';

type Mensagem = { tipo: 'sucesso' | 'erro' | 'info'; texto: string };
type Processo = 'area' | 'receita' | 'banco' | 'saldo';

type AreaOption = { id: number; nome: string };
type ContaOption = { id: number; nome: string; codigo: string };
type BancoOption = { id: number; nome: string };

type RegistroMensagem = Record<Processo, Mensagem | null>;
type RegistroProcesso = Record<Processo, boolean>;

type MaybeArray<T> = T | T[] | null | undefined;

type PagamentoAreaRow = {
  pag_id?: unknown;
  pag_valor?: unknown;
  pag_data?: unknown;
  pag_are_id?: unknown;
  are_areas?: MaybeArray<{ are_nome?: unknown } | null>;
};

type ReceitaRow = {
  rec_id?: unknown;
  rec_valor?: unknown;
  rec_data?: unknown;
  rec_ctr_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown } | null>;
};

type PagamentoBancoRow = {
  pbk_id?: unknown;
  pbk_valor?: unknown;
  pbk_data?: unknown;
  pbk_ban_id?: unknown;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
};

type SaldoBancoRow = {
  sdb_id?: unknown;
  sdb_saldo?: unknown;
  sdb_data?: unknown;
  sdb_ban_id?: unknown;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
};

type PagamentoArea = {
  id: number;
  valor: number;
  data: string;
  area: string;
  areaId: number;
};

type Receita = {
  id: number;
  valor: number;
  data: string;
  conta: string;
  contaId: number;
};

type PagamentoBanco = {
  id: number;
  valor: number;
  data: string;
  banco: string;
  bancoId: number;
};

type SaldoBanco = {
  id: number;
  valor: number;
  data: string;
  banco: string;
  bancoId: number;
};

type FormMapa = Record<number, string>;

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

const mapPagamentosArea = (rows: MaybeArray<PagamentoAreaRow | null>): PagamentoArea[] =>
  normalizeRelation(rows).map((row) => ({
    id: toNumber(row.pag_id),
    valor: toNumber(row.pag_valor),
    data: toString(row.pag_data),
    area: normalizeRelation(row.are_areas ?? null)[0]?.are_nome
      ? toString(normalizeRelation(row.are_areas ?? null)[0]?.are_nome)
      : 'Área não informada',
    areaId: toNumber(row.pag_are_id),
  }));

const mapReceitas = (rows: MaybeArray<ReceitaRow | null>): Receita[] =>
  normalizeRelation(rows).map((row) => ({
    id: toNumber(row.rec_id),
    valor: toNumber(row.rec_valor),
    data: toString(row.rec_data),
    conta: normalizeRelation(row.ctr_contas_receita ?? null)[0]?.ctr_nome
      ? toString(normalizeRelation(row.ctr_contas_receita ?? null)[0]?.ctr_nome)
      : 'Conta não informada',
    contaId: toNumber(row.rec_ctr_id),
  }));

const mapPagamentosBanco = (rows: MaybeArray<PagamentoBancoRow | null>): PagamentoBanco[] =>
  normalizeRelation(rows).map((row) => ({
    id: toNumber(row.pbk_id),
    valor: toNumber(row.pbk_valor),
    data: toString(row.pbk_data),
    banco: normalizeRelation(row.ban_bancos ?? null)[0]?.ban_nome
      ? toString(normalizeRelation(row.ban_bancos ?? null)[0]?.ban_nome)
      : 'Banco não informado',
    bancoId: toNumber(row.pbk_ban_id),
  }));

const mapSaldosBanco = (rows: MaybeArray<SaldoBancoRow | null>): SaldoBanco[] =>
  normalizeRelation(rows).map((row) => ({
    id: toNumber(row.sdb_id),
    valor: toNumber(row.sdb_saldo),
    data: toString(row.sdb_data),
    banco: normalizeRelation(row.ban_bancos ?? null)[0]?.ban_nome
      ? toString(normalizeRelation(row.ban_bancos ?? null)[0]?.ban_nome)
      : 'Banco não informado',
    bancoId: toNumber(row.sdb_ban_id),
  }));

const sincronizarMapa = (options: { id: number }[], mapa: FormMapa): FormMapa => {
  const next: FormMapa = {};
  options.forEach((option) => {
    next[option.id] = mapa[option.id] ?? '';
  });
  return next;
};

const formatarData = (isoDate: string): string => {
  if (!isoDate) {
    return '';
  }

  const data = new Date(isoDate + 'T00:00:00');
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(data);
};

const calcularUltimoDiaUtilAnterior = (): string => {
  const hoje = new Date();
  const data = new Date(hoje);

  for (let i = 1; i <= 7; i += 1) {
    data.setDate(hoje.getDate() - i);
    const diaSemana = data.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      return data.toISOString().split('T')[0];
    }
  }

  return new Date().toISOString().split('T')[0];
};

const normalizarExpressao = (valor: string): string =>
  valor.replace(/\s+/g, '').replace(/,/g, '.');

const avaliarEntrada = (valor: string | undefined): number | null => {
  if (!valor) {
    return null;
  }

  const normalizado = normalizarExpressao(valor);
  if (!normalizado) {
    return null;
  }

  const resultado = evaluateMath(normalizado);
  if (resultado !== null) {
    return resultado;
  }

  const parsed = Number(normalizado);
  if (Number.isFinite(parsed)) {
    return Math.round(parsed * 100) / 100;
  }

  return null;
};

const formatarValorParaInput = (valor: number | null | undefined): string => {
  if (valor === null || valor === undefined) {
    return '';
  }

  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return '';
  }

  return numero.toFixed(2).replace('.', ',');
};

const SaldoDiarioPage: React.FC = () => {
  const ultimoDiaUtil = useMemo(() => calcularUltimoDiaUtilAnterior(), []);
  const [dataReferencia, setDataReferencia] = useState(ultimoDiaUtil);

  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const [pagamentosArea, setPagamentosArea] = useState<PagamentoArea[]>([]);
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [pagamentosBanco, setPagamentosBanco] = useState<PagamentoBanco[]>([]);
  const [saldosBanco, setSaldosBanco] = useState<SaldoBanco[]>([]);

  const [areaOptions, setAreaOptions] = useState<AreaOption[]>([]);
  const [contaOptions, setContaOptions] = useState<ContaOption[]>([]);
  const [bancoOptions, setBancoOptions] = useState<BancoOption[]>([]);

  const [pagamentosAreaForm, setPagamentosAreaForm] = useState<FormMapa>({});
  const [receitasForm, setReceitasForm] = useState<FormMapa>({});
  const [pagamentosBancoForm, setPagamentosBancoForm] = useState<FormMapa>({});
  const [saldosBancoForm, setSaldosBancoForm] = useState<FormMapa>({});
  const [pagamentosAreaEdicao, setPagamentosAreaEdicao] = useState<FormMapa>({});
  const [receitasEdicao, setReceitasEdicao] = useState<FormMapa>({});
  const [pagamentosBancoEdicao, setPagamentosBancoEdicao] = useState<FormMapa>({});
  const [saldosBancoEdicao, setSaldosBancoEdicao] = useState<FormMapa>({});

  const [processando, setProcessando] = useState<RegistroProcesso>({
    area: false,
    receita: false,
    banco: false,
    saldo: false,
  });
  const [mensagens, setMensagens] = useState<RegistroMensagem>({
    area: null,
    receita: null,
    banco: null,
    saldo: null,
  });
  const [registroEditando, setRegistroEditando] = useState<Record<Processo, number | null>>({
    area: null,
    receita: null,
    banco: null,
    saldo: null,
  });
  const [registroExcluindo, setRegistroExcluindo] = useState<Record<Processo, number | null>>({
    area: null,
    receita: null,
    banco: null,
    saldo: null,
  });

  const edicaoLiberada = dataReferencia === ultimoDiaUtil;

  useEffect(() => {
    setPagamentosAreaForm((prev) => sincronizarMapa(areaOptions, prev));
  }, [areaOptions]);

  useEffect(() => {
    setReceitasForm((prev) => sincronizarMapa(contaOptions, prev));
  }, [contaOptions]);

  useEffect(() => {
    setPagamentosBancoForm((prev) => sincronizarMapa(bancoOptions, prev));
    setSaldosBancoForm((prev) => sincronizarMapa(bancoOptions, prev));
  }, [bancoOptions]);

  useEffect(() => {
    setPagamentosAreaEdicao(() => {
      const mapa: FormMapa = {};
      pagamentosArea.forEach((registro) => {
        mapa[registro.id] = formatarValorParaInput(registro.valor);
      });
      return mapa;
    });
  }, [pagamentosArea]);

  useEffect(() => {
    setReceitasEdicao(() => {
      const mapa: FormMapa = {};
      receitas.forEach((registro) => {
        mapa[registro.id] = formatarValorParaInput(registro.valor);
      });
      return mapa;
    });
  }, [receitas]);

  useEffect(() => {
    setPagamentosBancoEdicao(() => {
      const mapa: FormMapa = {};
      pagamentosBanco.forEach((registro) => {
        mapa[registro.id] = formatarValorParaInput(registro.valor);
      });
      return mapa;
    });
  }, [pagamentosBanco]);

  useEffect(() => {
    setSaldosBancoEdicao(() => {
      const mapa: FormMapa = {};
      saldosBanco.forEach((registro) => {
        mapa[registro.id] = formatarValorParaInput(registro.valor);
      });
      return mapa;
    });
  }, [saldosBanco]);

  const atualizarMensagem = useCallback(
    (processo: Processo, mensagem: Mensagem | null) => {
      setMensagens((prev) => ({ ...prev, [processo]: mensagem }));
    },
    []
  );

  const atualizarProcesso = useCallback((processo: Processo, status: boolean) => {
    setProcessando((prev) => ({ ...prev, [processo]: status }));
  }, []);

  const carregarOpcoes = useCallback(async () => {
    const supabase = getSupabaseClient();
    const [areasRes, contasRes, bancosRes] = await Promise.all([
      supabase
        .from('are_areas')
        .select('are_id, are_nome')
        .eq('are_ativo', true)
        .order('are_nome', { ascending: true }),
      supabase
        .from('ctr_contas_receita')
        .select('ctr_id, ctr_nome, ctr_codigo')
        .eq('ctr_ativo', true)
        .order('ctr_codigo, ctr_nome', { ascending: true }),
      supabase
        .from('ban_bancos')
        .select('ban_id, ban_nome')
        .eq('ban_ativo', true)
        .order('ban_nome', { ascending: true }),
    ]);

    if (areasRes.error) throw areasRes.error;
    if (contasRes.error) throw contasRes.error;
    if (bancosRes.error) throw bancosRes.error;

    setAreaOptions(
      (areasRes.data ?? []).map((area: { are_id: number; are_nome: string | null }) => ({
        id: Number(area.are_id),
        nome: area.are_nome ?? 'Área sem nome',
      }))
    );

    setContaOptions(
      (contasRes.data ?? []).map((conta: { ctr_id: number; ctr_nome: string | null; ctr_codigo: string | null }) => ({
        id: Number(conta.ctr_id),
        nome: conta.ctr_nome ?? 'Conta sem nome',
        codigo: conta.ctr_codigo ?? '',
      }))
    );

    setBancoOptions(
      (bancosRes.data ?? []).map((banco: { ban_id: number; ban_nome: string | null }) => ({
        id: Number(banco.ban_id),
        nome: banco.ban_nome ?? 'Banco sem nome',
      }))
    );
  }, []);

  const carregarMovimentacoes = useCallback(
    async (data: string) => {
      const supabase = getSupabaseClient();

      const [pagAreaRes, recRes, pagBancoRes, saldoRes] = await Promise.all([
        supabase
          .from('pag_pagamentos_area')
          .select('pag_id, pag_valor, pag_data, pag_are_id, are_areas(are_nome)')
          .eq('pag_data', data)
          .order('pag_criado_em', { ascending: false })
          .limit(100),
        supabase
          .from('rec_receitas')
          .select('rec_id, rec_valor, rec_data, rec_ctr_id, ctr_contas_receita(ctr_nome)')
          .eq('rec_data', data)
          .order('rec_criado_em', { ascending: false })
          .limit(100),
        supabase
          .from('pbk_pagamentos_banco')
          .select('pbk_id, pbk_valor, pbk_data, pbk_ban_id, ban_bancos(ban_nome)')
          .eq('pbk_data', data)
          .order('pbk_criado_em', { ascending: false })
          .limit(100),
        supabase
          .from('sdb_saldo_banco')
          .select('sdb_id, sdb_saldo, sdb_data, sdb_ban_id, ban_bancos(ban_nome)')
          .eq('sdb_data', data)
          .order('sdb_criado_em', { ascending: false })
          .limit(100),
      ]);

      if (pagAreaRes.error) throw pagAreaRes.error;
      if (recRes.error) throw recRes.error;
      if (pagBancoRes.error) throw pagBancoRes.error;
      if (saldoRes.error) throw saldoRes.error;

      setPagamentosArea(mapPagamentosArea(pagAreaRes.data as MaybeArray<PagamentoAreaRow | null>));
      setReceitas(mapReceitas(recRes.data as MaybeArray<ReceitaRow | null>));
      setPagamentosBanco(mapPagamentosBanco(pagBancoRes.data as MaybeArray<PagamentoBancoRow | null>));
      setSaldosBanco(mapSaldosBanco(saldoRes.data as MaybeArray<SaldoBancoRow | null>));
    },
    []
  );

  useEffect(() => {
    const inicializar = async () => {
      try {
        setCarregando(true);
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
          setErro('Não foi possível identificar o usuário atual.');
          return;
        }

        setUsuario(data);
        await carregarOpcoes();
        setErro(null);
      } catch (error) {
        console.error('Erro ao carregar movimentação diária:', error);
        setErro('Não foi possível carregar os dados da movimentação diária.');
      } finally {
        setCarregando(false);
      }
    };

    inicializar();
  }, [carregarOpcoes]);

  useEffect(() => {
    if (!usuario) {
      return;
    }

    const atualizar = async () => {
      try {
        setAtualizando(true);
        await carregarMovimentacoes(dataReferencia);
        setErro(null);
      } catch (error) {
        console.error('Erro ao atualizar movimentação diária:', error);
        setErro('Não foi possível carregar os dados para a data selecionada.');
      } finally {
        setAtualizando(false);
      }
    };

    atualizar();
  }, [usuario, dataReferencia, carregarMovimentacoes]);

  const limparMensagem = (processo: Processo) => atualizarMensagem(processo, null);

  const handleAtualizar = async () => {
    try {
      setAtualizando(true);
      await carregarMovimentacoes(dataReferencia);
      setErro(null);
    } catch (error) {
      console.error('Erro ao atualizar movimentação diária:', error);
      setErro('Não foi possível atualizar os dados. Tente novamente.');
    } finally {
      setAtualizando(false);
    }
  };

  const handleRegistrarPagamentosArea = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    if (!edicaoLiberada) {
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: `Os lançamentos só podem ser registrados para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    const novos: {
      pag_are_id: number;
      pag_usr_id: string;
      pag_data: string;
      pag_valor: number;
    }[] = [];
    const atualizacoes: PagamentoArea[] = [];

    areaOptions.forEach((area) => {
      const valorCalculado = avaliarEntrada(pagamentosAreaForm[area.id]);
      if (valorCalculado === null || valorCalculado <= 0) {
        return;
      }

      const existente = pagamentosAreaPorAreaId.get(area.id);
      if (existente) {
        if (Math.abs(valorCalculado - existente.valor) > 0.009) {
          atualizacoes.push({
            ...existente,
            valor: valorCalculado,
          });
        }
      } else {
        novos.push({
          pag_are_id: area.id,
          pag_usr_id: usuario.usr_id,
          pag_data: dataReferencia,
          pag_valor: valorCalculado,
        });
      }
    });

    if (novos.length === 0 && atualizacoes.length === 0) {
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: 'Informe valores válidos ou diferentes do que já está registrado antes de salvar.',
      });
      return;
    }

    try {
      atualizarProcesso('area', true);
      atualizarMensagem('area', null);

      const supabase = getSupabaseClient();
      if (novos.length > 0) {
        const { error: inserirErro } = await supabase.from('pag_pagamentos_area').insert(novos);
        if (inserirErro) throw inserirErro;
      }

      if (atualizacoes.length > 0) {
        const payload = atualizacoes.map((registro) => ({
          pag_id: registro.id,
          pag_are_id: registro.areaId,
          pag_usr_id: usuario.usr_id,
          pag_data: dataReferencia,
          pag_valor: registro.valor,
        }));
        const { error: atualizarErro } = await supabase
          .from('pag_pagamentos_area')
          .upsert(payload, { onConflict: 'pag_id' });
        if (atualizarErro) throw atualizarErro;
      }

      const areasProcessadas = new Set<number>();
      novos.forEach((item) => areasProcessadas.add(item.pag_are_id));
      atualizacoes.forEach((item) => areasProcessadas.add(item.areaId));

      if (areasProcessadas.size > 0) {
        setPagamentosAreaForm((prev) => {
          const next = { ...prev };
          areasProcessadas.forEach((id) => {
            next[id] = '';
          });
          return next;
        });
      }

      const mensagemPartes: string[] = [];
      if (novos.length > 0) {
        mensagemPartes.push(`${novos.length} novo${novos.length > 1 ? 's' : ''}`);
      }
      if (atualizacoes.length > 0) {
        mensagemPartes.push(`${atualizacoes.length} atualizado${atualizacoes.length > 1 ? 's' : ''}`);
      }

      atualizarMensagem('area', {
        tipo: 'sucesso',
        texto:
          mensagemPartes.length === 0
            ? 'Pagamentos por área registrados.'
            : `Pagamentos por área salvos (${mensagemPartes.join(' e ')}).`,
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao registrar pagamento por área:', error);
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível registrar os pagamentos. Verifique os dados e tente novamente.',
        ),
      });
    } finally {
      atualizarProcesso('area', false);
    }
  };

  const handleRegistrarReceitas = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    if (!edicaoLiberada) {
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: `Os lançamentos só podem ser registrados para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    const novos: {
      rec_ctr_id: number;
      rec_usr_id: string;
      rec_data: string;
      rec_valor: number;
    }[] = [];
    const atualizacoes: Receita[] = [];

    contaOptions.forEach((conta) => {
      const valorCalculado = avaliarEntrada(receitasForm[conta.id]);
      if (valorCalculado === null || valorCalculado <= 0) {
        return;
      }

      const existente = receitasPorContaId.get(conta.id);
      if (existente) {
        if (Math.abs(valorCalculado - existente.valor) > 0.009) {
          atualizacoes.push({
            ...existente,
            valor: valorCalculado,
          });
        }
      } else {
        novos.push({
          rec_ctr_id: conta.id,
          rec_usr_id: usuario.usr_id,
          rec_data: dataReferencia,
          rec_valor: valorCalculado,
        });
      }
    });

    if (novos.length === 0 && atualizacoes.length === 0) {
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: 'Informe valores válidos ou diferentes do que já está registrado antes de salvar.',
      });
      return;
    }

    try {
      atualizarProcesso('receita', true);
      atualizarMensagem('receita', null);

      const supabase = getSupabaseClient();
      if (novos.length > 0) {
        const { error: inserirErro } = await supabase.from('rec_receitas').insert(novos);
        if (inserirErro) throw inserirErro;
      }

      if (atualizacoes.length > 0) {
        const payload = atualizacoes.map((registro) => ({
          rec_id: registro.id,
          rec_ctr_id: registro.contaId,
          rec_usr_id: usuario.usr_id,
          rec_data: dataReferencia,
          rec_valor: registro.valor,
        }));
        const { error: atualizarErro } = await supabase
          .from('rec_receitas')
          .upsert(payload, { onConflict: 'rec_id' });
        if (atualizarErro) throw atualizarErro;
      }

      const contasProcessadas = new Set<number>();
      novos.forEach((item) => contasProcessadas.add(item.rec_ctr_id));
      atualizacoes.forEach((item) => contasProcessadas.add(item.contaId));

      if (contasProcessadas.size > 0) {
        setReceitasForm((prev) => {
          const next = { ...prev };
          contasProcessadas.forEach((id) => {
            next[id] = '';
          });
          return next;
        });
      }

      const mensagemPartes: string[] = [];
      if (novos.length > 0) {
        mensagemPartes.push(`${novos.length} nova${novos.length > 1 ? 's' : ''}`);
      }
      if (atualizacoes.length > 0) {
        mensagemPartes.push(`${atualizacoes.length} atualizada${atualizacoes.length > 1 ? 's' : ''}`);
      }

      atualizarMensagem('receita', {
        tipo: 'sucesso',
        texto:
          mensagemPartes.length === 0
            ? 'Receitas registradas com sucesso.'
            : `Receitas salvas (${mensagemPartes.join(' e ')}).`,
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao registrar receitas:', error);
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível registrar as receitas. Tente novamente em instantes.',
        ),
      });
    } finally {
      atualizarProcesso('receita', false);
    }
  };

  const handleRegistrarPagamentosBanco = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    if (!edicaoLiberada) {
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: `Os lançamentos só podem ser registrados para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    const novos: {
      pbk_ban_id: number;
      pbk_usr_id: string;
      pbk_data: string;
      pbk_valor: number;
    }[] = [];
    const atualizacoes: PagamentoBanco[] = [];

    bancoOptions.forEach((banco) => {
      const valorCalculado = avaliarEntrada(pagamentosBancoForm[banco.id]);
      if (valorCalculado === null || valorCalculado <= 0) {
        return;
      }

      const existente = pagamentosBancoPorBancoId.get(banco.id);
      if (existente) {
        if (Math.abs(valorCalculado - existente.valor) > 0.009) {
          atualizacoes.push({
            ...existente,
            valor: valorCalculado,
          });
        }
      } else {
        novos.push({
          pbk_ban_id: banco.id,
          pbk_usr_id: usuario.usr_id,
          pbk_data: dataReferencia,
          pbk_valor: valorCalculado,
        });
      }
    });

    if (novos.length === 0 && atualizacoes.length === 0) {
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: 'Informe valores válidos ou diferentes do que já está registrado antes de salvar.',
      });
      return;
    }

    try {
      atualizarProcesso('banco', true);
      atualizarMensagem('banco', null);

      const supabase = getSupabaseClient();
      if (novos.length > 0) {
        const { error: inserirErro } = await supabase.from('pbk_pagamentos_banco').insert(novos);
        if (inserirErro) throw inserirErro;
      }

      if (atualizacoes.length > 0) {
        const payload = atualizacoes.map((registro) => ({
          pbk_id: registro.id,
          pbk_ban_id: registro.bancoId,
          pbk_usr_id: usuario.usr_id,
          pbk_data: dataReferencia,
          pbk_valor: registro.valor,
        }));
        const { error: atualizarErro } = await supabase
          .from('pbk_pagamentos_banco')
          .upsert(payload, { onConflict: 'pbk_id' });
        if (atualizarErro) throw atualizarErro;
      }

      const bancosProcessados = new Set<number>();
      novos.forEach((item) => bancosProcessados.add(item.pbk_ban_id));
      atualizacoes.forEach((item) => bancosProcessados.add(item.bancoId));

      if (bancosProcessados.size > 0) {
        setPagamentosBancoForm((prev) => {
          const next = { ...prev };
          bancosProcessados.forEach((id) => {
            next[id] = '';
          });
          return next;
        });
      }

      const mensagemPartes: string[] = [];
      if (novos.length > 0) {
        mensagemPartes.push(`${novos.length} novo${novos.length > 1 ? 's' : ''}`);
      }
      if (atualizacoes.length > 0) {
        mensagemPartes.push(`${atualizacoes.length} atualizado${atualizacoes.length > 1 ? 's' : ''}`);
      }

      atualizarMensagem('banco', {
        tipo: 'sucesso',
        texto:
          mensagemPartes.length === 0
            ? 'Pagamentos bancários registrados.'
            : `Pagamentos bancários salvos (${mensagemPartes.join(' e ')}).`,
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao registrar pagamentos bancários:', error);
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível registrar os pagamentos bancários. Revise os dados e tente novamente.',
        ),
      });
    } finally {
      atualizarProcesso('banco', false);
    }
  };

  const handleRegistrarSaldosBanco = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    if (!edicaoLiberada) {
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: `Os lançamentos só podem ser registrados para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    const registros = bancoOptions
      .map((banco) => {
        const valorCalculado = avaliarEntrada(saldosBancoForm[banco.id]);
        if (valorCalculado === null) {
          return null;
        }

        return {
          sdb_ban_id: banco.id,
          sdb_usr_id: usuario.usr_id,
          sdb_data: dataReferencia,
          sdb_saldo: valorCalculado,
        };
      })
      .filter(Boolean) as {
      sdb_ban_id: number;
      sdb_usr_id: string;
      sdb_data: string;
      sdb_saldo: number;
    }[];

    if (registros.length === 0) {
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: 'Informe saldos numéricos para ao menos um banco antes de salvar.',
      });
      return;
    }

    try {
      atualizarProcesso('saldo', true);
      atualizarMensagem('saldo', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('sdb_saldo_banco')
        .upsert(registros, { onConflict: 'sdb_ban_id,sdb_data' });

      if (error) throw error;

      setSaldosBancoForm((prev) => {
        const next = { ...prev };
        registros.forEach((registro) => {
          next[registro.sdb_ban_id] = '';
        });
        return next;
      });

      atualizarMensagem('saldo', {
        tipo: 'sucesso',
        texto:
          registros.length === 1
            ? 'Saldo bancário atualizado com sucesso.'
            : `${registros.length} saldos bancários atualizados com sucesso.`,
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao registrar saldos bancários:', error);
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível registrar os saldos. Tente novamente.',
        ),
      });
    } finally {
      atualizarProcesso('saldo', false);
    }
  };

  const handleAtualizarPagamentoAreaExistente = async (registro: PagamentoArea) => {
    if (!usuario) return;
    if (!edicaoLiberada) {
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: `As edições só podem ser realizadas para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    const entrada = pagamentosAreaEdicao[registro.id] ?? '';
    const valorCalculado = avaliarEntrada(entrada);
    if (valorCalculado === null || valorCalculado <= 0) {
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: 'Informe um valor positivo para atualizar o pagamento.',
      });
      return;
    }

    if (Math.abs(valorCalculado - registro.valor) < 0.01) {
      atualizarMensagem('area', {
        tipo: 'info',
        texto: 'O valor informado é igual ao já registrado.',
      });
      return;
    }

    try {
      setRegistroEditando((prev) => ({ ...prev, area: registro.id }));
      atualizarMensagem('area', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('pag_pagamentos_area')
        .update({ pag_valor: valorCalculado })
        .eq('pag_id', registro.id);

      if (error) throw error;

      atualizarMensagem('area', {
        tipo: 'sucesso',
        texto: 'Pagamento por área atualizado com sucesso.',
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao atualizar pagamento por área:', error);
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível atualizar o pagamento selecionado. Tente novamente.',
        ),
      });
    } finally {
      setRegistroEditando((prev) => ({ ...prev, area: null }));
    }
  };

  const handleExcluirPagamentoArea = async (registro: PagamentoArea) => {
    if (!usuario) return;
    if (!edicaoLiberada) {
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: `As exclusões só podem ser realizadas para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    try {
      setRegistroExcluindo((prev) => ({ ...prev, area: registro.id }));
      atualizarMensagem('area', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('pag_pagamentos_area').delete().eq('pag_id', registro.id);
      if (error) throw error;

      atualizarMensagem('area', {
        tipo: 'sucesso',
        texto: 'Pagamento por área removido com sucesso.',
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao excluir pagamento por área:', error);
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível remover o pagamento selecionado. Tente novamente.',
        ),
      });
    } finally {
      setRegistroExcluindo((prev) => ({ ...prev, area: null }));
    }
  };

  const handleAtualizarReceitaExistente = async (registro: Receita) => {
    if (!usuario) return;
    if (!edicaoLiberada) {
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: `As edições só podem ser realizadas para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    const entrada = receitasEdicao[registro.id] ?? '';
    const valorCalculado = avaliarEntrada(entrada);
    if (valorCalculado === null || valorCalculado <= 0) {
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: 'Informe um valor positivo para atualizar a receita.',
      });
      return;
    }

    if (Math.abs(valorCalculado - registro.valor) < 0.01) {
      atualizarMensagem('receita', {
        tipo: 'info',
        texto: 'O valor informado é igual ao já registrado.',
      });
      return;
    }

    try {
      setRegistroEditando((prev) => ({ ...prev, receita: registro.id }));
      atualizarMensagem('receita', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('rec_receitas')
        .update({ rec_valor: valorCalculado })
        .eq('rec_id', registro.id);

      if (error) throw error;

      atualizarMensagem('receita', {
        tipo: 'sucesso',
        texto: 'Receita atualizada com sucesso.',
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao atualizar receita:', error);
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível atualizar a receita selecionada. Tente novamente.',
        ),
      });
    } finally {
      setRegistroEditando((prev) => ({ ...prev, receita: null }));
    }
  };

  const handleExcluirReceita = async (registro: Receita) => {
    if (!usuario) return;
    if (!edicaoLiberada) {
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: `As exclusões só podem ser realizadas para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    try {
      setRegistroExcluindo((prev) => ({ ...prev, receita: registro.id }));
      atualizarMensagem('receita', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('rec_receitas').delete().eq('rec_id', registro.id);
      if (error) throw error;

      atualizarMensagem('receita', {
        tipo: 'sucesso',
        texto: 'Receita removida com sucesso.',
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao excluir receita:', error);
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível remover a receita selecionada. Tente novamente.',
        ),
      });
    } finally {
      setRegistroExcluindo((prev) => ({ ...prev, receita: null }));
    }
  };

  const handleAtualizarPagamentoBancoExistente = async (registro: PagamentoBanco) => {
    if (!usuario) return;
    if (!edicaoLiberada) {
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: `As edições só podem ser realizadas para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    const entrada = pagamentosBancoEdicao[registro.id] ?? '';
    const valorCalculado = avaliarEntrada(entrada);
    if (valorCalculado === null || valorCalculado <= 0) {
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: 'Informe um valor positivo para atualizar o pagamento.',
      });
      return;
    }

    if (Math.abs(valorCalculado - registro.valor) < 0.01) {
      atualizarMensagem('banco', {
        tipo: 'info',
        texto: 'O valor informado é igual ao já registrado.',
      });
      return;
    }

    try {
      setRegistroEditando((prev) => ({ ...prev, banco: registro.id }));
      atualizarMensagem('banco', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('pbk_pagamentos_banco')
        .update({ pbk_valor: valorCalculado })
        .eq('pbk_id', registro.id);

      if (error) throw error;

      atualizarMensagem('banco', {
        tipo: 'sucesso',
        texto: 'Pagamento por banco atualizado com sucesso.',
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao atualizar pagamento por banco:', error);
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível atualizar o pagamento selecionado. Tente novamente.',
        ),
      });
    } finally {
      setRegistroEditando((prev) => ({ ...prev, banco: null }));
    }
  };

  const handleExcluirPagamentoBanco = async (registro: PagamentoBanco) => {
    if (!usuario) return;
    if (!edicaoLiberada) {
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: `As exclusões só podem ser realizadas para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    try {
      setRegistroExcluindo((prev) => ({ ...prev, banco: registro.id }));
      atualizarMensagem('banco', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('pbk_pagamentos_banco').delete().eq('pbk_id', registro.id);
      if (error) throw error;

      atualizarMensagem('banco', {
        tipo: 'sucesso',
        texto: 'Pagamento bancário removido com sucesso.',
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao excluir pagamento bancário:', error);
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível remover o pagamento bancário selecionado. Tente novamente.',
        ),
      });
    } finally {
      setRegistroExcluindo((prev) => ({ ...prev, banco: null }));
    }
  };

  const handleAtualizarSaldoBancoExistente = async (registro: SaldoBanco) => {
    if (!usuario) return;
    if (!edicaoLiberada) {
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: `As edições só podem ser realizadas para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    const entrada = saldosBancoEdicao[registro.id] ?? '';
    const valorCalculado = avaliarEntrada(entrada);
    if (valorCalculado === null) {
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: 'Informe um saldo numérico para atualizar o banco selecionado.',
      });
      return;
    }

    if (Math.abs(valorCalculado - registro.valor) < 0.01) {
      atualizarMensagem('saldo', {
        tipo: 'info',
        texto: 'O valor informado é igual ao já registrado.',
      });
      return;
    }

    try {
      setRegistroEditando((prev) => ({ ...prev, saldo: registro.id }));
      atualizarMensagem('saldo', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('sdb_saldo_banco')
        .update({ sdb_saldo: valorCalculado })
        .eq('sdb_id', registro.id);

      if (error) throw error;

      atualizarMensagem('saldo', {
        tipo: 'sucesso',
        texto: 'Saldo bancário atualizado com sucesso.',
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao atualizar saldo bancário:', error);
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível atualizar o saldo selecionado. Tente novamente.',
        ),
      });
    } finally {
      setRegistroEditando((prev) => ({ ...prev, saldo: null }));
    }
  };

  const handleExcluirSaldoBanco = async (registro: SaldoBanco) => {
    if (!usuario) return;
    if (!edicaoLiberada) {
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: `As exclusões só podem ser realizadas para o último dia útil (${formatarData(ultimoDiaUtil)}).`,
      });
      return;
    }

    try {
      setRegistroExcluindo((prev) => ({ ...prev, saldo: registro.id }));
      atualizarMensagem('saldo', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('sdb_saldo_banco').delete().eq('sdb_id', registro.id);
      if (error) throw error;

      atualizarMensagem('saldo', {
        tipo: 'sucesso',
        texto: 'Saldo bancário removido com sucesso.',
      });
      await carregarMovimentacoes(dataReferencia);
    } catch (error) {
      console.error('Erro ao excluir saldo bancário:', error);
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: traduzirErroSupabase(
          error,
          'Não foi possível remover o saldo selecionado. Tente novamente.',
        ),
      });
    } finally {
      setRegistroExcluindo((prev) => ({ ...prev, saldo: null }));
    }
  };

  const totalPagamentosArea = useMemo(
    () => pagamentosArea.reduce((sum, p) => sum + Number(p.valor), 0),
    [pagamentosArea]
  );
  const totalReceitas = useMemo(
    () => receitas.reduce((sum, r) => sum + Number(r.valor), 0),
    [receitas]
  );
  const totalPagamentosBanco = useMemo(
    () => pagamentosBanco.reduce((sum, p) => sum + Number(p.valor), 0),
    [pagamentosBanco]
  );
  const totalSaldos = useMemo(
    () => saldosBanco.reduce((sum, s) => sum + Number(s.valor), 0),
    [saldosBanco]
  );

  const totalFormArea = useMemo(
    () =>
      areaOptions.reduce((sum, area) => {
        const valor = avaliarEntrada(pagamentosAreaForm[area.id]);
        return sum + (valor ?? 0);
      }, 0),
    [areaOptions, pagamentosAreaForm]
  );

  const totalFormReceita = useMemo(
    () =>
      contaOptions.reduce((sum, conta) => {
        const valor = avaliarEntrada(receitasForm[conta.id]);
        return sum + (valor ?? 0);
      }, 0),
    [contaOptions, receitasForm]
  );

  const totalFormPagBanco = useMemo(
    () =>
      bancoOptions.reduce((sum, banco) => {
        const valor = avaliarEntrada(pagamentosBancoForm[banco.id]);
        return sum + (valor ?? 0);
      }, 0),
    [bancoOptions, pagamentosBancoForm]
  );

  const totalFormSaldoBanco = useMemo(
    () =>
      bancoOptions.reduce((sum, banco) => {
        const valor = avaliarEntrada(saldosBancoForm[banco.id]);
        return sum + (valor ?? 0);
      }, 0),
    [bancoOptions, saldosBancoForm]
  );

  const pagamentosAreaPorAreaId = useMemo(() => {
    const mapa = new Map<number, PagamentoArea>();
    pagamentosArea.forEach((registro) => {
      if (registro.areaId) {
        mapa.set(registro.areaId, registro);
      }
    });
    return mapa;
  }, [pagamentosArea]);

  const receitasPorContaId = useMemo(() => {
    const mapa = new Map<number, Receita>();
    receitas.forEach((registro) => {
      if (registro.contaId) {
        mapa.set(registro.contaId, registro);
      }
    });
    return mapa;
  }, [receitas]);

  const pagamentosBancoPorBancoId = useMemo(() => {
    const mapa = new Map<number, PagamentoBanco>();
    pagamentosBanco.forEach((registro) => {
      if (registro.bancoId) {
        mapa.set(registro.bancoId, registro);
      }
    });
    return mapa;
  }, [pagamentosBanco]);

  const saldosBancoPorBancoId = useMemo(() => {
    const mapa = new Map<number, SaldoBanco>();
    saldosBanco.forEach((registro) => {
      if (registro.bancoId) {
        mapa.set(registro.bancoId, registro);
      }
    });
    return mapa;
  }, [saldosBanco]);

  const helperValor = (valor: string | undefined): string | undefined => {
    const resultado = avaliarEntrada(valor);
    return resultado !== null ? `Resultado: ${formatCurrency(resultado)}` : undefined;
  };

  // Separar contas por código
  const contasTitulos = useMemo(() => contaOptions.filter(c => c.codigo === '200'), [contaOptions]);
  const contasDepositosPix = useMemo(() => contaOptions.filter(c => c.codigo === '201'), [contaOptions]);
  const contasOutras = useMemo(() => contaOptions.filter(c => c.codigo !== '200' && c.codigo !== '201'), [contaOptions]);

  // Resumos
  const resumoPorBanco = useMemo(() => {
    const resumo = new Map<number, { banco: string; total: number }>();
    receitas.forEach(rec => {
      const conta = contaOptions.find(c => c.id === rec.contaId);
      if (conta) {
        // Aqui você precisaria ter o banco_id na conta para agrupar
        // Por enquanto vamos apenas criar estrutura básica
      }
    });
    return resumo;
  }, [receitas, contaOptions]);

  const resumoPorTipoReceita = useMemo(() => {
    const resumo = new Map<string, { tipo: string; total: number }>();
    receitas.forEach(rec => {
      const conta = contaOptions.find(c => c.id === rec.contaId);
      if (conta) {
        const tipo = conta.codigo === '200' ? 'Títulos (200)' : conta.codigo === '201' ? 'Depósitos e PIX (201)' : 'Outros';
        const atual = resumo.get(tipo) || { tipo, total: 0 };
        resumo.set(tipo, { tipo, total: atual.total + rec.valor });
      }
    });
    return Array.from(resumo.values());
  }, [receitas, contaOptions]);

  if (carregando) {
    return (
      <>
        <Header title="Movimentação Diária" />
        <div className="page-content flex items-center justify-center h-96">
          <Loading size="lg" text="Carregando dados..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Movimentação Diária"
        subtitle={`Operação referenciada em ${formatarData(dataReferencia)}`}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Input
              type="date"
              value={dataReferencia}
              onChange={(event) => setDataReferencia(event.target.value)}
              min={ultimoDiaUtil}
              max={ultimoDiaUtil}
              helperText="Os lançamentos ficam disponíveis apenas para o último dia útil."
            />
            <Button variant="secondary" onClick={handleAtualizar} loading={atualizando}>
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <div className="rounded-md border border-error-200 bg-error-50 px-4 py-3 text-error-700">
            {erro}
          </div>
        )}

        {!edicaoLiberada && (
          <div className="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-warning-800">
            Os formulários estão bloqueados porque o dia selecionado não é o último dia útil. Ajuste a data para
            {` ${formatarData(ultimoDiaUtil)}`} para registrar novos valores.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white/80 p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pagamentos por Área</p>
            <p className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(totalPagamentosArea)}</p>
            <p className="mt-1 text-xs text-gray-400">Valores já registrados</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white/80 p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Receitas por Conta</p>
            <p className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(totalReceitas)}</p>
            <p className="mt-1 text-xs text-gray-400">Receitas consolidadas</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white/80 p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pagamentos por Banco</p>
            <p className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(totalPagamentosBanco)}</p>
            <p className="mt-1 text-xs text-gray-400">Saídas bancárias do dia</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white/80 p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo por Banco</p>
            <p className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(totalSaldos)}</p>
            <p className="mt-1 text-xs text-gray-400">Saldos registrados</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card title="Pagamentos por Área" subtitle={`Total registrado: ${formatCurrency(totalPagamentosArea)}`} variant="primary">
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarPagamentosArea}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPagamentosAreaForm(sincronizarMapa(areaOptions, {}));
                        limparMensagem('area');
                      }}
                      disabled={processando.area || areaOptions.length === 0}
                    >
                      Limpar campos
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={processando.area}
                      disabled={areaOptions.length === 0 || !edicaoLiberada}
                    >
                      Registrar pagamentos
                    </Button>
                  </div>
                  <div className="rounded-md border border-dashed border-primary-200 bg-primary-50/40 px-4 py-2 text-sm text-primary-800">
                    <span>Total a registrar: </span>
                    <strong>{formatCurrency(totalFormArea)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Área</th>
                        <th className="px-4 py-3 text-left font-semibold w-52">Valor / Expressão</th>
                        <th className="px-4 py-3 text-left font-semibold min-w-[280px]">Registrado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      {areaOptions.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                            Cadastre áreas no menu Cadastros &gt; Áreas para liberar esta seção.
                          </td>
                        </tr>
                      ) : (
                        areaOptions.map((area) => {
                          const registro = pagamentosAreaPorAreaId.get(area.id);
                          return (
                            <tr key={area.id}>
                              <td className="px-4 py-3 font-medium text-gray-700">{area.nome}</td>
                              <td className="px-4 py-3 align-top">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Ex.: 10+20+30"
                                  value={pagamentosAreaForm[area.id] ?? ''}
                                  onChange={(event) =>
                                    setPagamentosAreaForm((prev) => ({
                                      ...prev,
                                      [area.id]: event.target.value,
                                    }))
                                  }
                                  disabled={processando.area || !edicaoLiberada}
                                  helperText={helperValor(pagamentosAreaForm[area.id])}
                                  fullWidth
                                />
                              </td>
                              <td className="px-4 py-3 align-top">
                                {registro ? (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-semibold text-primary-700">
                                        {formatCurrency(registro.valor)}
                                      </span>
                                      <span className="text-xs text-gray-400">
                                        {formatarData(registro.data)}
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={pagamentosAreaEdicao[registro.id] ?? ''}
                                        onChange={(event) =>
                                          setPagamentosAreaEdicao((prev) => ({
                                            ...prev,
                                            [registro.id]: event.target.value,
                                          }))
                                        }
                                        disabled={
                                          !edicaoLiberada ||
                                          registroEditando.area === registro.id ||
                                          registroExcluindo.area === registro.id
                                        }
                                        helperText={helperValor(pagamentosAreaEdicao[registro.id])}
                                        className="sm:w-44"
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => handleAtualizarPagamentoAreaExistente(registro)}
                                          disabled={!edicaoLiberada}
                                          loading={registroEditando.area === registro.id}
                                        >
                                          Salvar
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="danger"
                                          size="sm"
                                          onClick={() => handleExcluirPagamentoArea(registro)}
                                          disabled={!edicaoLiberada}
                                          loading={registroExcluindo.area === registro.id}
                                        >
                                          Excluir
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-400">Nenhum valor registrado</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {mensagens.area && (
                  <div
                    className={`rounded-md border px-4 py-2 text-sm ${
                      mensagens.area.tipo === 'sucesso'
                        ? 'border-success-200 bg-success-50 text-success-700'
                        : mensagens.area.tipo === 'erro'
                        ? 'border-error-200 bg-error-50 text-error-700'
                        : 'border-primary-200 bg-primary-50 text-primary-800'
                    }`}
                  >
                    {mensagens.area.texto}
                  </div>
                )}
              </form>

            </div>
          </Card>
          <Card title="Pagamentos por Banco" subtitle={`Total registrado: ${formatCurrency(totalPagamentosBanco)}`} variant="danger">
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarPagamentosBanco}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPagamentosBancoForm(sincronizarMapa(bancoOptions, {}));
                        limparMensagem('banco');
                      }}
                      disabled={processando.banco || bancoOptions.length === 0}
                    >
                      Limpar campos
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={processando.banco}
                      disabled={bancoOptions.length === 0 || !edicaoLiberada}
                    >
                      Registrar pagamentos
                    </Button>
                  </div>
                  <div className="rounded-md border border-dashed border-error-200 bg-error-50/50 px-4 py-2 text-sm text-error-700">
                    <span>Total a registrar: </span>
                    <strong>{formatCurrency(totalFormPagBanco)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Banco</th>
                        <th className="px-4 py-3 text-left font-semibold w-52">Valor / Expressão</th>
                        <th className="px-4 py-3 text-left font-semibold min-w-[280px]">Registrado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      {bancoOptions.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                            Cadastre bancos no menu Cadastros &gt; Bancos para liberar esta seção.
                          </td>
                        </tr>
                      ) : (
                        bancoOptions.map((banco) => {
                          const registro = pagamentosBancoPorBancoId.get(banco.id);
                          return (
                            <tr key={banco.id}>
                              <td className="px-4 py-3 font-medium text-gray-700">{banco.nome}</td>
                              <td className="px-4 py-3 align-top">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Ex.: 1200/3"
                                  value={pagamentosBancoForm[banco.id] ?? ''}
                                  onChange={(event) =>
                                    setPagamentosBancoForm((prev) => ({
                                      ...prev,
                                      [banco.id]: event.target.value,
                                    }))
                                  }
                                  disabled={processando.banco || !edicaoLiberada}
                                  helperText={helperValor(pagamentosBancoForm[banco.id])}
                                  fullWidth
                                />
                              </td>
                              <td className="px-4 py-3 align-top">
                                {registro ? (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-semibold text-error-700">
                                        {formatCurrency(registro.valor)}
                                      </span>
                                      <span className="text-xs text-gray-400">{formatarData(registro.data)}</span>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={pagamentosBancoEdicao[registro.id] ?? ''}
                                        onChange={(event) =>
                                          setPagamentosBancoEdicao((prev) => ({
                                            ...prev,
                                            [registro.id]: event.target.value,
                                          }))
                                        }
                                        disabled={
                                          !edicaoLiberada ||
                                          registroEditando.banco === registro.id ||
                                          registroExcluindo.banco === registro.id
                                        }
                                        helperText={helperValor(pagamentosBancoEdicao[registro.id])}
                                        className="sm:w-44"
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => handleAtualizarPagamentoBancoExistente(registro)}
                                          disabled={!edicaoLiberada}
                                          loading={registroEditando.banco === registro.id}
                                        >
                                          Salvar
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="danger"
                                          size="sm"
                                          onClick={() => handleExcluirPagamentoBanco(registro)}
                                          disabled={!edicaoLiberada}
                                          loading={registroExcluindo.banco === registro.id}
                                        >
                                          Excluir
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-400">Nenhum valor registrado</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {mensagens.banco && (
                  <div
                    className={`rounded-md border px-4 py-2 text-sm ${
                      mensagens.banco.tipo === 'sucesso'
                        ? 'border-success-200 bg-success-50 text-success-700'
                        : mensagens.banco.tipo === 'erro'
                        ? 'border-error-200 bg-error-50 text-error-700'
                        : 'border-primary-200 bg-primary-50 text-primary-800'
                    }`}
                  >
                    {mensagens.banco.texto}
                  </div>
                )}
              </form>

            </div>
          </Card>
          <Card title="Receitas" subtitle={`Total registrado: ${formatCurrency(totalReceitas)}`} variant="success">
            <div className="space-y-5">
              {/* Seção Títulos (Conta 200) */}
              {contasTitulos.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <h3 className="text-sm font-semibold text-red-800 mb-3">
                    🔴 Títulos (Conta 200)
                  </h3>
                  <div className="space-y-2">
                    {contasTitulos.map(conta => {
                      const registro = receitasPorContaId.get(conta.id);
                      return (
                        <div key={conta.id} className="text-sm bg-white/50 p-2 rounded">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-700">{conta.nome}</span>
                            {registro && (
                              <span className="text-success-700 font-semibold">
                                {formatCurrency(registro.valor)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Seção Depósitos e PIX (Conta 201) */}
              {contasDepositosPix.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <h3 className="text-sm font-semibold text-red-800 mb-3">
                    🔴 Depósitos e PIX (Conta 201)
                  </h3>
                  <div className="space-y-2">
                    {contasDepositosPix.map(conta => {
                      const registro = receitasPorContaId.get(conta.id);
                      return (
                        <div key={conta.id} className="text-sm bg-white/50 p-2 rounded">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-700">{conta.nome}</span>
                            {registro && (
                              <span className="text-success-700 font-semibold">
                                {formatCurrency(registro.valor)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Resumo por Banco */}
              {receitas.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <h3 className="text-sm font-semibold text-red-800 mb-3">
                    🔴 Resumo por Banco
                  </h3>
                  <div className="space-y-2">
                    {Array.from(new Set(receitas.map(r => {
                      const conta = contaOptions.find(c => c.id === r.contaId);
                      return conta ? `Banco ${r.contaId}` : 'Sem banco';
                    }))).map((banco, idx) => (
                      <div key={idx} className="text-sm bg-white/50 p-2 rounded">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-700">{banco}</span>
                          <span className="text-success-700 font-semibold">-</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumo por Tipo de Receita */}
              {resumoPorTipoReceita.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <h3 className="text-sm font-semibold text-red-800 mb-3">
                    🔴 Resumo por Tipo de Receita
                  </h3>
                  <div className="space-y-2">
                    {resumoPorTipoReceita.map((item, idx) => (
                      <div key={idx} className="text-sm bg-white/50 p-2 rounded">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-700">{item.tipo}</span>
                          <span className="text-success-700 font-semibold">
                            {formatCurrency(item.total)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form className="space-y-4" onSubmit={handleRegistrarReceitas}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReceitasForm(sincronizarMapa(contaOptions, {}));
                        limparMensagem('receita');
                      }}
                      disabled={processando.receita || contaOptions.length === 0}
                    >
                      Limpar campos
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={processando.receita}
                      disabled={contaOptions.length === 0 || !edicaoLiberada}
                    >
                      Registrar receitas
                    </Button>
                  </div>
                  <div className="rounded-md border border-dashed border-success-200 bg-success-50/40 px-4 py-2 text-sm text-success-800">
                    <span>Total a registrar: </span>
                    <strong>{formatCurrency(totalFormReceita)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Conta de receita</th>
                        <th className="px-4 py-3 text-left font-semibold w-52">Valor / Expressão</th>
                        <th className="px-4 py-3 text-left font-semibold min-w-[280px]">Registrado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      {contaOptions.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                            Cadastre contas em Cadastros &gt; Contas de Receita para liberar esta seção.
                          </td>
                        </tr>
                      ) : (
                        contaOptions.map((conta) => {
                          const registro = receitasPorContaId.get(conta.id);
                          return (
                            <tr key={conta.id}>
                              <td className="px-4 py-3 font-medium text-gray-700">{conta.nome}</td>
                              <td className="px-4 py-3 align-top">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Ex.: 500-125"
                                  value={receitasForm[conta.id] ?? ''}
                                  onChange={(event) =>
                                    setReceitasForm((prev) => ({
                                      ...prev,
                                      [conta.id]: event.target.value,
                                    }))
                                  }
                                  disabled={processando.receita || !edicaoLiberada}
                                  helperText={helperValor(receitasForm[conta.id])}
                                  fullWidth
                                />
                              </td>
                              <td className="px-4 py-3 align-top">
                                {registro ? (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-semibold text-success-700">
                                        {formatCurrency(registro.valor)}
                                      </span>
                                      <span className="text-xs text-gray-400">{formatarData(registro.data)}</span>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={receitasEdicao[registro.id] ?? ''}
                                        onChange={(event) =>
                                          setReceitasEdicao((prev) => ({
                                            ...prev,
                                            [registro.id]: event.target.value,
                                          }))
                                        }
                                        disabled={
                                          !edicaoLiberada ||
                                          registroEditando.receita === registro.id ||
                                          registroExcluindo.receita === registro.id
                                        }
                                        helperText={helperValor(receitasEdicao[registro.id])}
                                        className="sm:w-44"
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => handleAtualizarReceitaExistente(registro)}
                                          disabled={!edicaoLiberada}
                                          loading={registroEditando.receita === registro.id}
                                        >
                                          Salvar
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="danger"
                                          size="sm"
                                          onClick={() => handleExcluirReceita(registro)}
                                          disabled={!edicaoLiberada}
                                          loading={registroExcluindo.receita === registro.id}
                                        >
                                          Excluir
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-400">Nenhum valor registrado</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {mensagens.receita && (
                  <div
                    className={`rounded-md border px-4 py-2 text-sm ${
                      mensagens.receita.tipo === 'sucesso'
                        ? 'border-success-200 bg-success-50 text-success-700'
                        : mensagens.receita.tipo === 'erro'
                        ? 'border-error-200 bg-error-50 text-error-700'
                        : 'border-primary-200 bg-primary-50 text-primary-800'
                    }`}
                  >
                    {mensagens.receita.texto}
                  </div>
                )}
              </form>

            </div>
          </Card>

          <Card title="Saldo por Banco" subtitle={`Total registrado: ${formatCurrency(totalSaldos)}`} variant="default">
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarSaldosBanco}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSaldosBancoForm(sincronizarMapa(bancoOptions, {}));
                        limparMensagem('saldo');
                      }}
                      disabled={processando.saldo || bancoOptions.length === 0}
                    >
                      Limpar campos
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={processando.saldo}
                      disabled={bancoOptions.length === 0 || !edicaoLiberada}
                    >
                      Atualizar saldos
                    </Button>
                  </div>
                  <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700">
                    <span>Total informado: </span>
                    <strong>{formatCurrency(totalFormSaldoBanco)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Banco</th>
                        <th className="px-4 py-3 text-left font-semibold w-52">Saldo / Expressão</th>
                        <th className="px-4 py-3 text-left font-semibold min-w-[280px]">Registrado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      {bancoOptions.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                            Cadastre bancos no menu Cadastros &gt; Bancos para liberar esta seção.
                          </td>
                        </tr>
                      ) : (
                        bancoOptions.map((banco) => {
                          const registro = saldosBancoPorBancoId.get(banco.id);
                          return (
                            <tr key={banco.id}>
                              <td className="px-4 py-3 font-medium text-gray-700">{banco.nome}</td>
                              <td className="px-4 py-3 align-top">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Ex.: 1000-250"
                                  value={saldosBancoForm[banco.id] ?? ''}
                                  onChange={(event) =>
                                    setSaldosBancoForm((prev) => ({
                                      ...prev,
                                      [banco.id]: event.target.value,
                                    }))
                                  }
                                  disabled={processando.saldo || !edicaoLiberada}
                                  helperText={helperValor(saldosBancoForm[banco.id])}
                                  fullWidth
                                />
                              </td>
                              <td className="px-4 py-3 align-top">
                                {registro ? (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span
                                        className={`font-semibold ${
                                          registro.valor >= 0 ? 'text-success-700' : 'text-error-700'
                                        }`}
                                      >
                                        {formatCurrency(registro.valor)}
                                      </span>
                                      <span className="text-xs text-gray-400">{formatarData(registro.data)}</span>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={saldosBancoEdicao[registro.id] ?? ''}
                                        onChange={(event) =>
                                          setSaldosBancoEdicao((prev) => ({
                                            ...prev,
                                            [registro.id]: event.target.value,
                                          }))
                                        }
                                        disabled={
                                          !edicaoLiberada ||
                                          registroEditando.saldo === registro.id ||
                                          registroExcluindo.saldo === registro.id
                                        }
                                        helperText={helperValor(saldosBancoEdicao[registro.id])}
                                        className="sm:w-44"
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => handleAtualizarSaldoBancoExistente(registro)}
                                          disabled={!edicaoLiberada}
                                          loading={registroEditando.saldo === registro.id}
                                        >
                                          Salvar
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="danger"
                                          size="sm"
                                          onClick={() => handleExcluirSaldoBanco(registro)}
                                          disabled={!edicaoLiberada}
                                          loading={registroExcluindo.saldo === registro.id}
                                        >
                                          Excluir
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-400">Nenhum saldo registrado</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {mensagens.saldo && (
                  <div
                    className={`rounded-md border px-4 py-2 text-sm ${
                      mensagens.saldo.tipo === 'sucesso'
                        ? 'border-success-200 bg-success-50 text-success-700'
                        : mensagens.saldo.tipo === 'erro'
                        ? 'border-error-200 bg-error-50 text-error-700'
                        : 'border-primary-200 bg-primary-50 text-primary-800'
                    }`}
                  >
                    {mensagens.saldo.texto}
                  </div>
                )}
              </form>

            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

export default SaldoDiarioPage;
