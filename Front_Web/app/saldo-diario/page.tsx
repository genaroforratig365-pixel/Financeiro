
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

type Mensagem = { tipo: 'sucesso' | 'erro'; texto: string };
type Processo = 'area' | 'receita' | 'banco' | 'saldo';

type AreaOption = { id: number; nome: string };
type ContaOption = { id: number; nome: string };
type BancoOption = { id: number; nome: string };

type RegistroMensagem = Record<Processo, Mensagem | null>;
type RegistroProcesso = Record<Processo, boolean>;

type MaybeArray<T> = T | T[] | null | undefined;

type PagamentoAreaRow = {
  pag_id?: unknown;
  pag_valor?: unknown;
  pag_data?: unknown;
  are_areas?: MaybeArray<{ are_nome?: unknown } | null>;
};

type ReceitaRow = {
  rec_id?: unknown;
  rec_valor?: unknown;
  rec_data?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown } | null>;
};

type PagamentoBancoRow = {
  pbk_id?: unknown;
  pbk_valor?: unknown;
  pbk_data?: unknown;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
};

type SaldoBancoRow = {
  sdb_id?: unknown;
  sdb_saldo?: unknown;
  sdb_data?: unknown;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
};

type PagamentoArea = {
  id: number;
  valor: number;
  data: string;
  area: string;
};

type Receita = {
  id: number;
  valor: number;
  data: string;
  conta: string;
};

type PagamentoBanco = {
  id: number;
  valor: number;
  data: string;
  banco: string;
};

type SaldoBanco = {
  id: number;
  valor: number;
  data: string;
  banco: string;
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
  }));

const mapReceitas = (rows: MaybeArray<ReceitaRow | null>): Receita[] =>
  normalizeRelation(rows).map((row) => ({
    id: toNumber(row.rec_id),
    valor: toNumber(row.rec_valor),
    data: toString(row.rec_data),
    conta: normalizeRelation(row.ctr_contas_receita ?? null)[0]?.ctr_nome
      ? toString(normalizeRelation(row.ctr_contas_receita ?? null)[0]?.ctr_nome)
      : 'Conta não informada',
  }));

const mapPagamentosBanco = (rows: MaybeArray<PagamentoBancoRow | null>): PagamentoBanco[] =>
  normalizeRelation(rows).map((row) => ({
    id: toNumber(row.pbk_id),
    valor: toNumber(row.pbk_valor),
    data: toString(row.pbk_data),
    banco: normalizeRelation(row.ban_bancos ?? null)[0]?.ban_nome
      ? toString(normalizeRelation(row.ban_bancos ?? null)[0]?.ban_nome)
      : 'Banco não informado',
  }));

const mapSaldosBanco = (rows: MaybeArray<SaldoBancoRow | null>): SaldoBanco[] =>
  normalizeRelation(rows).map((row) => ({
    id: toNumber(row.sdb_id),
    valor: toNumber(row.sdb_saldo),
    data: toString(row.sdb_data),
    banco: normalizeRelation(row.ban_bancos ?? null)[0]?.ban_nome
      ? toString(normalizeRelation(row.ban_bancos ?? null)[0]?.ban_nome)
      : 'Banco não informado',
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
        .select('ctr_id, ctr_nome')
        .eq('ctr_ativo', true)
        .order('ctr_nome', { ascending: true }),
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
      (contasRes.data ?? []).map((conta: { ctr_id: number; ctr_nome: string | null }) => ({
        id: Number(conta.ctr_id),
        nome: conta.ctr_nome ?? 'Conta sem nome',
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
          .select('pag_id, pag_valor, pag_data, are_areas(are_nome)')
          .eq('pag_data', data)
          .order('pag_criado_em', { ascending: false })
          .limit(100),
        supabase
          .from('rec_receitas')
          .select('rec_id, rec_valor, rec_data, ctr_contas_receita(ctr_nome)')
          .eq('rec_data', data)
          .order('rec_criado_em', { ascending: false })
          .limit(100),
        supabase
          .from('pbk_pagamentos_banco')
          .select('pbk_id, pbk_valor, pbk_data, ban_bancos(ban_nome)')
          .eq('pbk_data', data)
          .order('pbk_criado_em', { ascending: false })
          .limit(100),
        supabase
          .from('sdb_saldo_banco')
          .select('sdb_id, sdb_saldo, sdb_data, ban_bancos(ban_nome)')
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

    const registros = areaOptions
      .map((area) => {
        const valorCalculado = avaliarEntrada(pagamentosAreaForm[area.id]);
        if (valorCalculado === null || valorCalculado <= 0) {
          return null;
        }

        return {
          pag_are_id: area.id,
          pag_usr_id: usuario.usr_id,
          pag_data: dataReferencia,
          pag_valor: valorCalculado,
        };
      })
      .filter(Boolean) as {
      pag_are_id: number;
      pag_usr_id: string;
      pag_data: string;
      pag_valor: number;
    }[];

    if (registros.length === 0) {
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: 'Informe valores válidos para pelo menos uma área antes de registrar.',
      });
      return;
    }

    try {
      atualizarProcesso('area', true);
      atualizarMensagem('area', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('pag_pagamentos_area').insert(registros);

      if (error) throw error;

      setPagamentosAreaForm((prev) => {
        const next = { ...prev };
        registros.forEach((registro) => {
          next[registro.pag_are_id] = '';
        });
        return next;
      });

      atualizarMensagem('area', {
        tipo: 'sucesso',
        texto:
          registros.length === 1
            ? 'Pagamento por área registrado com sucesso.'
            : `${registros.length} pagamentos por área registrados com sucesso.`,
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

    const registros = contaOptions
      .map((conta) => {
        const valorCalculado = avaliarEntrada(receitasForm[conta.id]);
        if (valorCalculado === null || valorCalculado <= 0) {
          return null;
        }

        return {
          rec_ctr_id: conta.id,
          rec_usr_id: usuario.usr_id,
          rec_data: dataReferencia,
          rec_valor: valorCalculado,
        };
      })
      .filter(Boolean) as {
      rec_ctr_id: number;
      rec_usr_id: string;
      rec_data: string;
      rec_valor: number;
    }[];

    if (registros.length === 0) {
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: 'Informe valores válidos para pelo menos uma conta de receita antes de registrar.',
      });
      return;
    }

    try {
      atualizarProcesso('receita', true);
      atualizarMensagem('receita', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('rec_receitas').insert(registros);

      if (error) throw error;

      setReceitasForm((prev) => {
        const next = { ...prev };
        registros.forEach((registro) => {
          next[registro.rec_ctr_id] = '';
        });
        return next;
      });

      atualizarMensagem('receita', {
        tipo: 'sucesso',
        texto:
          registros.length === 1
            ? 'Receita registrada com sucesso.'
            : `${registros.length} receitas registradas com sucesso.`,
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

    const registros = bancoOptions
      .map((banco) => {
        const valorCalculado = avaliarEntrada(pagamentosBancoForm[banco.id]);
        if (valorCalculado === null || valorCalculado <= 0) {
          return null;
        }

        return {
          pbk_ban_id: banco.id,
          pbk_usr_id: usuario.usr_id,
          pbk_data: dataReferencia,
          pbk_valor: valorCalculado,
        };
      })
      .filter(Boolean) as {
      pbk_ban_id: number;
      pbk_usr_id: string;
      pbk_data: string;
      pbk_valor: number;
    }[];

    if (registros.length === 0) {
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: 'Informe valores válidos para pelo menos um banco antes de registrar.',
      });
      return;
    }

    try {
      atualizarProcesso('banco', true);
      atualizarMensagem('banco', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('pbk_pagamentos_banco').insert(registros);

      if (error) throw error;

      setPagamentosBancoForm((prev) => {
        const next = { ...prev };
        registros.forEach((registro) => {
          next[registro.pbk_ban_id] = '';
        });
        return next;
      });

      atualizarMensagem('banco', {
        tipo: 'sucesso',
        texto:
          registros.length === 1
            ? 'Pagamento bancário registrado com sucesso.'
            : `${registros.length} pagamentos bancários registrados com sucesso.`,
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

  const helperValor = (valor: string | undefined): string | undefined => {
    const resultado = avaliarEntrada(valor);
    return resultado !== null ? `Resultado: ${formatCurrency(resultado)}` : undefined;
  };

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Pagamentos por Área" subtitle={`Total registrado: ${formatCurrency(totalPagamentosArea)}`} variant="primary">
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarPagamentosArea}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600">
                    Preencha os valores das áreas e utilize operações básicas (ex.: 10+20-5) para agilizar o registro.
                  </p>
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
                </div>

                <div className="flex items-center justify-between rounded-md border border-dashed border-primary-200 bg-primary-50/40 px-4 py-2 text-sm text-primary-800">
                  <span>Total a registrar:</span>
                  <strong>{formatCurrency(totalFormArea)}</strong>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Área</th>
                        <th className="px-4 py-3 text-left font-semibold w-48">Valor / Expressão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      {areaOptions.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-500">
                            Cadastre áreas no menu Cadastros &gt; Áreas para liberar esta seção.
                          </td>
                        </tr>
                      ) : (
                        areaOptions.map((area) => (
                          <tr key={area.id}>
                            <td className="px-4 py-3 font-medium text-gray-700">{area.nome}</td>
                            <td className="px-4 py-3">
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
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {mensagens.area && (
                  <div
                    className={`rounded-md border px-4 py-2 text-sm ${
                      mensagens.area.tipo === 'sucesso'
                        ? 'border-success-200 bg-success-50 text-success-700'
                        : 'border-error-200 bg-error-50 text-error-700'
                    }`}
                  >
                    {mensagens.area.texto}
                  </div>
                )}
              </form>

              <div className="border-t border-gray-200 pt-3">
                {pagamentosArea.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nenhum pagamento registrado na data selecionada.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pagamentosArea.map((pag) => (
                      <li key={pag.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{pag.area}</span>
                          <span className="text-xs text-gray-500">{formatarData(pag.data)}</span>
                        </div>
                        <span className="font-semibold text-gray-900">{formatCurrency(pag.valor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
          <Card title="Receitas" subtitle={`Total registrado: ${formatCurrency(totalReceitas)}`} variant="success">
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarReceitas}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600">
                    Distribua as receitas por tipo. Você pode somar ou subtrair valores direto no campo.
                  </p>
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
                </div>

                <div className="flex items-center justify-between rounded-md border border-dashed border-success-200 bg-success-50/40 px-4 py-2 text-sm text-success-800">
                  <span>Total a registrar:</span>
                  <strong>{formatCurrency(totalFormReceita)}</strong>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Conta de receita</th>
                        <th className="px-4 py-3 text-left font-semibold w-48">Valor / Expressão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      {contaOptions.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-500">
                            Cadastre contas em Cadastros &gt; Contas de Receita para liberar esta seção.
                          </td>
                        </tr>
                      ) : (
                        contaOptions.map((conta) => (
                          <tr key={conta.id}>
                            <td className="px-4 py-3 font-medium text-gray-700">{conta.nome}</td>
                            <td className="px-4 py-3">
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
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {mensagens.receita && (
                  <div
                    className={`rounded-md border px-4 py-2 text-sm ${
                      mensagens.receita.tipo === 'sucesso'
                        ? 'border-success-200 bg-success-50 text-success-700'
                        : 'border-error-200 bg-error-50 text-error-700'
                    }`}
                  >
                    {mensagens.receita.texto}
                  </div>
                )}
              </form>

              <div className="border-t border-gray-200 pt-3">
                {receitas.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nenhuma receita registrada na data selecionada.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {receitas.map((rec) => (
                      <li key={rec.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{rec.conta}</span>
                          <span className="text-xs text-gray-500">{formatarData(rec.data)}</span>
                        </div>
                        <span className="font-semibold text-success-700">{formatCurrency(rec.valor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
          <Card title="Pagamentos por Banco" subtitle={`Total registrado: ${formatCurrency(totalPagamentosBanco)}`} variant="danger">
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarPagamentosBanco}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600">
                    Informe os pagamentos bancários e utilize expressões para compor o valor rapidamente.
                  </p>
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
                </div>

                <div className="flex items-center justify-between rounded-md border border-dashed border-error-200 bg-error-50/50 px-4 py-2 text-sm text-error-700">
                  <span>Total a registrar:</span>
                  <strong>{formatCurrency(totalFormPagBanco)}</strong>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Banco</th>
                        <th className="px-4 py-3 text-left font-semibold w-48">Valor / Expressão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      {bancoOptions.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-500">
                            Cadastre bancos no menu Cadastros &gt; Bancos para liberar esta seção.
                          </td>
                        </tr>
                      ) : (
                        bancoOptions.map((banco) => (
                          <tr key={banco.id}>
                            <td className="px-4 py-3 font-medium text-gray-700">{banco.nome}</td>
                            <td className="px-4 py-3">
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
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {mensagens.banco && (
                  <div
                    className={`rounded-md border px-4 py-2 text-sm ${
                      mensagens.banco.tipo === 'sucesso'
                        ? 'border-success-200 bg-success-50 text-success-700'
                        : 'border-error-200 bg-error-50 text-error-700'
                    }`}
                  >
                    {mensagens.banco.texto}
                  </div>
                )}
              </form>

              <div className="border-t border-gray-200 pt-3">
                {pagamentosBanco.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nenhum pagamento bancário registrado na data selecionada.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pagamentosBanco.map((pag) => (
                      <li key={pag.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{pag.banco}</span>
                          <span className="text-xs text-gray-500">{formatarData(pag.data)}</span>
                        </div>
                        <span className="font-semibold text-error-700">{formatCurrency(pag.valor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <Card title="Saldo por Banco" subtitle={`Total registrado: ${formatCurrency(totalSaldos)}`} variant="default">
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarSaldosBanco}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600">
                    Informe os saldos consolidados para o dia útil selecionado. Expresse cálculos quando necessário.
                  </p>
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
                </div>

                <div className="flex items-center justify-between rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700">
                  <span>Total informado:</span>
                  <strong>{formatCurrency(totalFormSaldoBanco)}</strong>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Banco</th>
                        <th className="px-4 py-3 text-left font-semibold w-48">Saldo / Expressão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      {bancoOptions.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-500">
                            Cadastre bancos no menu Cadastros &gt; Bancos para liberar esta seção.
                          </td>
                        </tr>
                      ) : (
                        bancoOptions.map((banco) => (
                          <tr key={banco.id}>
                            <td className="px-4 py-3 font-medium text-gray-700">{banco.nome}</td>
                            <td className="px-4 py-3">
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
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {mensagens.saldo && (
                  <div
                    className={`rounded-md border px-4 py-2 text-sm ${
                      mensagens.saldo.tipo === 'sucesso'
                        ? 'border-success-200 bg-success-50 text-success-700'
                        : 'border-error-200 bg-error-50 text-error-700'
                    }`}
                  >
                    {mensagens.saldo.texto}
                  </div>
                )}
              </form>

              <div className="border-t border-gray-200 pt-3">
                {saldosBanco.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nenhum saldo registrado na data selecionada.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {saldosBanco.map((saldo) => (
                      <li key={saldo.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{saldo.banco}</span>
                          <span className="text-xs text-gray-500">{formatarData(saldo.data)}</span>
                        </div>
                        <span className={`font-semibold ${saldo.valor >= 0 ? 'text-success-700' : 'text-error-700'}`}>
                          {formatCurrency(saldo.valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

export default SaldoDiarioPage;
