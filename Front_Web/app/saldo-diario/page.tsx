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
import { formatCurrency } from '@/lib/mathParser';

type Mensagem = { tipo: 'sucesso' | 'erro'; texto: string };
type Processo = 'area' | 'receita' | 'banco' | 'saldo';

type AreaOption = { id: number; nome: string };
type ContaOption = { id: number; nome: string };
type BancoOption = { id: number; nome: string };

type CampoValorDescricao = { valor: string; descricao: string };
type RegistroMensagem = Record<Processo, Mensagem | null>;
type RegistroProcesso = Record<Processo, boolean>;

const criarMapaVazio = (lista: { id: number }[]): Record<number, CampoValorDescricao> =>
  lista.reduce<Record<number, CampoValorDescricao>>((acc, item) => {
    acc[item.id] = { valor: '', descricao: '' };
    return acc;
  }, {});

type AreaRelacionada = { are_nome: string | null };
type ContaReceitaRelacionada = { ctr_nome: string | null };
type BancoRelacionado = { ban_nome: string | null };

type MaybeArray<T> = T | T[] | null | undefined;

type PagamentoAreaRow = {
  pag_id?: unknown;
  pag_valor?: unknown;
  pag_descricao?: unknown;
  are_areas?: MaybeArray<{ are_nome?: unknown } | null>;
};

type ReceitaRow = {
  rec_id?: unknown;
  rec_valor?: unknown;
  rec_descricao?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown } | null>;
};

type PagamentoBancoRow = {
  pbk_id?: unknown;
  pbk_valor?: unknown;
  pbk_descricao?: unknown;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
};

type SaldoBancoRow = {
  sdb_id?: unknown;
  sdb_saldo?: unknown;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
};

interface PagamentoArea {
  pag_id: number;
  pag_valor: number;
  pag_descricao: string;
  are_areas: AreaRelacionada[];
}

interface Receita {
  rec_id: number;
  rec_valor: number;
  rec_descricao: string;
  ctr_contas_receita: ContaReceitaRelacionada[];
}

interface PagamentoBanco {
  pbk_id: number;
  pbk_valor: number;
  pbk_descricao: string;
  ban_bancos: BancoRelacionado[];
}

interface SaldoBanco {
  sdb_id: number;
  sdb_saldo: number;
  ban_bancos: BancoRelacionado[];
}

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

const toStringOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
};

const normalizePagamentosArea = (rows: MaybeArray<PagamentoAreaRow | null>): PagamentoArea[] =>
  normalizeRelation(rows).map((row) => ({
    pag_id: toNumber(row.pag_id),
    pag_valor: toNumber(row.pag_valor),
    pag_descricao: toString(row.pag_descricao),
    are_areas: normalizeRelation(row.are_areas ?? null).map((area) => ({
      are_nome: toStringOrNull(area.are_nome),
    })),
  }));

const normalizeReceitas = (rows: MaybeArray<ReceitaRow | null>): Receita[] =>
  normalizeRelation(rows).map((row) => ({
    rec_id: toNumber(row.rec_id),
    rec_valor: toNumber(row.rec_valor),
    rec_descricao: toString(row.rec_descricao),
    ctr_contas_receita: normalizeRelation(row.ctr_contas_receita ?? null).map((conta) => ({
      ctr_nome: toStringOrNull(conta.ctr_nome),
    })),
  }));

const normalizePagamentosBanco = (rows: MaybeArray<PagamentoBancoRow | null>): PagamentoBanco[] =>
  normalizeRelation(rows).map((row) => ({
    pbk_id: toNumber(row.pbk_id),
    pbk_valor: toNumber(row.pbk_valor),
    pbk_descricao: toString(row.pbk_descricao),
    ban_bancos: normalizeRelation(row.ban_bancos ?? null).map((banco) => ({
      ban_nome: toStringOrNull(banco.ban_nome),
    })),
  }));

const normalizeSaldosBanco = (rows: MaybeArray<SaldoBancoRow | null>): SaldoBanco[] =>
  normalizeRelation(rows).map((row) => ({
    sdb_id: toNumber(row.sdb_id),
    sdb_saldo: toNumber(row.sdb_saldo),
    ban_bancos: normalizeRelation(row.ban_bancos ?? null).map((banco) => ({
      ban_nome: toStringOrNull(banco.ban_nome),
    })),
  }));

const parseValorMonetario = (valor: string): number | null => {
  if (!valor) {
    return null;
  }

  const sanitized = valor.replace(/\./g, '').replace(',', '.');
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
};

const SaldoDiarioPage: React.FC = () => {
  const hojePadrao = useMemo(() => new Date().toISOString().split('T')[0], []);

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

  const [pagamentosAreaForm, setPagamentosAreaForm] = useState<Record<number, CampoValorDescricao>>({});
  const [receitasForm, setReceitasForm] = useState<Record<number, CampoValorDescricao>>({});
  const [pagamentosBancoForm, setPagamentosBancoForm] = useState<Record<number, CampoValorDescricao>>({});
  const [saldosBancoForm, setSaldosBancoForm] = useState<Record<number, CampoValorDescricao>>({});
  const [dataSaldoReferencia, setDataSaldoReferencia] = useState(hojePadrao);

  useEffect(() => {
    setPagamentosAreaForm((prev) => {
      const next: Record<number, CampoValorDescricao> = {};
      areaOptions.forEach((area) => {
        next[area.id] = prev[area.id] ?? { valor: '', descricao: '' };
      });
      return next;
    });
  }, [areaOptions]);

  useEffect(() => {
    setReceitasForm((prev) => {
      const next: Record<number, CampoValorDescricao> = {};
      contaOptions.forEach((conta) => {
        next[conta.id] = prev[conta.id] ?? { valor: '', descricao: '' };
      });
      return next;
    });
  }, [contaOptions]);

  useEffect(() => {
    setPagamentosBancoForm((prev) => {
      const next: Record<number, CampoValorDescricao> = {};
      bancoOptions.forEach((banco) => {
        next[banco.id] = prev[banco.id] ?? { valor: '', descricao: '' };
      });
      return next;
    });
  }, [bancoOptions]);

  useEffect(() => {
    setSaldosBancoForm((prev) => {
      const next: Record<number, CampoValorDescricao> = {};
      bancoOptions.forEach((banco) => {
        next[banco.id] = prev[banco.id] ?? { valor: '', descricao: '' };
      });
      return next;
    });
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

  const carregarOpcoes = useCallback(
    async (dadosUsuario: UsuarioRow) => {
      const supabase = getSupabaseClient();
      const [areasRes, contasRes, bancosRes] = await Promise.all([
        supabase
          .from('are_areas')
          .select('are_id, are_nome')
          .eq('are_usr_id', dadosUsuario.usr_id)
          .eq('are_ativo', true)
          .order('are_nome', { ascending: true }),
        supabase
          .from('ctr_contas_receita')
          .select('ctr_id, ctr_nome')
          .eq('ctr_usr_id', dadosUsuario.usr_id)
          .eq('ctr_ativo', true)
          .order('ctr_nome', { ascending: true }),
        supabase
          .from('ban_bancos')
          .select('ban_id, ban_nome')
          .eq('ban_usr_id', dadosUsuario.usr_id)
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
    },
    []
  );

  const carregarMovimentacoes = useCallback(
    async (dadosUsuario: UsuarioRow) => {
      const supabase = getSupabaseClient();
      const hoje = new Date().toISOString().split('T')[0];

      const [pagAreaRes, recRes, pagBancoRes, saldoRes] = await Promise.all([
        supabase
          .from('pag_pagamentos_area')
          .select('pag_id, pag_valor, pag_descricao, are_areas(are_nome)')
          .eq('pag_usr_id', dadosUsuario.usr_id)
          .eq('pag_data', hoje)
          .order('pag_criado_em', { ascending: false })
          .limit(5),
        supabase
          .from('rec_receitas')
          .select('rec_id, rec_valor, rec_descricao, ctr_contas_receita(ctr_nome)')
          .eq('rec_usr_id', dadosUsuario.usr_id)
          .eq('rec_data', hoje)
          .order('rec_criado_em', { ascending: false })
          .limit(5),
        supabase
          .from('pbk_pagamentos_banco')
          .select('pbk_id, pbk_valor, pbk_descricao, ban_bancos(ban_nome)')
          .eq('pbk_usr_id', dadosUsuario.usr_id)
          .eq('pbk_data', hoje)
          .order('pbk_criado_em', { ascending: false })
          .limit(5),
        supabase
          .from('sdb_saldo_banco')
          .select('sdb_id, sdb_saldo, ban_bancos(ban_nome)')
          .eq('sdb_usr_id', dadosUsuario.usr_id)
          .order('sdb_data', { ascending: false })
          .limit(10),
      ]);

      if (pagAreaRes.error) throw pagAreaRes.error;
      if (recRes.error) throw recRes.error;
      if (pagBancoRes.error) throw pagBancoRes.error;
      if (saldoRes.error) throw saldoRes.error;

      setPagamentosArea(normalizePagamentosArea(pagAreaRes.data as MaybeArray<PagamentoAreaRow | null>));
      setReceitas(normalizeReceitas(recRes.data as MaybeArray<ReceitaRow | null>));
      setPagamentosBanco(
        normalizePagamentosBanco(pagBancoRes.data as MaybeArray<PagamentoBancoRow | null>)
      );
      setSaldosBanco(normalizeSaldosBanco(saldoRes.data as MaybeArray<SaldoBancoRow | null>));
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
        await Promise.all([carregarOpcoes(data), carregarMovimentacoes(data)]);
        setErro(null);
      } catch (error) {
        console.error('Erro ao carregar movimentação diária:', error);
        setErro('Não foi possível carregar os dados da movimentação diária.');
      } finally {
        setCarregando(false);
      }
    };

    inicializar();
  }, [carregarMovimentacoes, carregarOpcoes]);

  const handleAtualizar = async () => {
    if (!usuario) {
      return;
    }

    try {
      setAtualizando(true);
      await carregarMovimentacoes(usuario);
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

    const registros = areaOptions
      .map((area) => {
        const campos = pagamentosAreaForm[area.id];
        if (!campos) {
          return null;
        }

        const valor = parseValorMonetario(campos.valor);
        if (valor === null || valor <= 0) {
          return null;
        }

        const descricao = campos.descricao.trim();
        return {
          pag_are_id: area.id,
          pag_usr_id: usuario.usr_id,
          pag_valor: valor,
          pag_descricao: descricao.length > 0 ? descricao : null,
        };
      })
      .filter(Boolean) as {
      pag_are_id: number;
      pag_usr_id: string;
      pag_valor: number;
      pag_descricao: string | null;
    }[];

    if (registros.length === 0) {
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: 'Informe ao menos um valor maior que zero para registrar os pagamentos por área.',
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
          next[registro.pag_are_id] = { valor: '', descricao: '' };
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
      await carregarMovimentacoes(usuario);
    } catch (error) {
      console.error('Erro ao registrar pagamento por área:', error);
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: 'Não foi possível registrar os pagamentos. Verifique os dados e tente novamente.',
      });
    } finally {
      atualizarProcesso('area', false);
    }
  };

  const handleRegistrarReceitas = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    const registros = contaOptions
      .map((conta) => {
        const campos = receitasForm[conta.id];
        if (!campos) {
          return null;
        }

        const valor = parseValorMonetario(campos.valor);
        if (valor === null || valor <= 0) {
          return null;
        }

        const descricao = campos.descricao.trim();
        return {
          rec_ctr_id: conta.id,
          rec_usr_id: usuario.usr_id,
          rec_valor: valor,
          rec_descricao: descricao.length > 0 ? descricao : null,
        };
      })
      .filter(Boolean) as {
      rec_ctr_id: number;
      rec_usr_id: string;
      rec_valor: number;
      rec_descricao: string | null;
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
          next[registro.rec_ctr_id] = { valor: '', descricao: '' };
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
      await carregarMovimentacoes(usuario);
    } catch (error) {
      console.error('Erro ao registrar receitas:', error);
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: 'Não foi possível registrar as receitas. Tente novamente em instantes.',
      });
    } finally {
      atualizarProcesso('receita', false);
    }
  };

  const handleRegistrarPagamentosBanco = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    const registros = bancoOptions
      .map((banco) => {
        const campos = pagamentosBancoForm[banco.id];
        if (!campos) {
          return null;
        }

        const valor = parseValorMonetario(campos.valor);
        if (valor === null || valor <= 0) {
          return null;
        }

        const descricao = campos.descricao.trim();
        return {
          pbk_ban_id: banco.id,
          pbk_usr_id: usuario.usr_id,
          pbk_valor: valor,
          pbk_descricao: descricao.length > 0 ? descricao : null,
        };
      })
      .filter(Boolean) as {
      pbk_ban_id: number;
      pbk_usr_id: string;
      pbk_valor: number;
      pbk_descricao: string | null;
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
          next[registro.pbk_ban_id] = { valor: '', descricao: '' };
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
      await carregarMovimentacoes(usuario);
    } catch (error) {
      console.error('Erro ao registrar pagamentos bancários:', error);
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: 'Não foi possível registrar os pagamentos bancários. Revise os dados e tente novamente.',
      });
    } finally {
      atualizarProcesso('banco', false);
    }
  };

  const handleRegistrarSaldosBanco = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    const dataReferencia = dataSaldoReferencia || hojePadrao;

    const registros = bancoOptions
      .map((banco) => {
        const campos = saldosBancoForm[banco.id];
        if (!campos) {
          return null;
        }

        const valor = parseValorMonetario(campos.valor);
        if (valor === null || Number.isNaN(valor)) {
          return null;
        }

        const descricao = campos.descricao.trim();
        return {
          sdb_ban_id: banco.id,
          sdb_usr_id: usuario.usr_id,
          sdb_saldo: valor,
          sdb_data: dataReferencia,
          sdb_descricao: descricao.length > 0 ? descricao : null,
        };
      })
      .filter(Boolean) as {
      sdb_ban_id: number;
      sdb_usr_id: string;
      sdb_saldo: number;
      sdb_data: string;
      sdb_descricao: string | null;
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
          next[registro.sdb_ban_id] = { valor: '', descricao: '' };
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
      await carregarMovimentacoes(usuario);
    } catch (error) {
      console.error('Erro ao registrar saldos bancários:', error);
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: 'Não foi possível registrar os saldos. Tente novamente.',
      });
    } finally {
      atualizarProcesso('saldo', false);
    }
  };

  const totalPagamentosArea = pagamentosArea.reduce((sum, p) => sum + Number(p.pag_valor), 0);
  const totalReceitas = receitas.reduce((sum, r) => sum + Number(r.rec_valor), 0);
  const totalPagamentosBanco = pagamentosBanco.reduce((sum, p) => sum + Number(p.pbk_valor), 0);
  const totalSaldos = saldosBanco.reduce((sum, s) => sum + Number(s.sdb_saldo), 0);

  const resumoPagamentosArea = Object.entries(
    pagamentosArea.reduce<Record<string, number>>((acc, pag) => {
      const nome = pag.are_areas[0]?.are_nome ?? 'Área sem nome';
      acc[nome] = (acc[nome] ?? 0) + pag.pag_valor;
      return acc;
    }, {})
  );

  const resumoReceitas = Object.entries(
    receitas.reduce<Record<string, number>>((acc, receita) => {
      const nome = receita.ctr_contas_receita[0]?.ctr_nome ?? 'Conta sem nome';
      acc[nome] = (acc[nome] ?? 0) + receita.rec_valor;
      return acc;
    }, {})
  );

  const resumoPagamentosBanco = Object.entries(
    pagamentosBanco.reduce<Record<string, number>>((acc, pagamento) => {
      const nome = pagamento.ban_bancos[0]?.ban_nome ?? 'Banco sem nome';
      acc[nome] = (acc[nome] ?? 0) + pagamento.pbk_valor;
      return acc;
    }, {})
  );

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
        subtitle={`Resumo operacional do dia - ${new Date().toLocaleDateString('pt-BR')}`}
        actions={
          <Button variant="secondary" onClick={handleAtualizar} loading={atualizando}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Atualizar
          </Button>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <div className="rounded-md border border-error-200 bg-error-50 px-4 py-3 text-error-700">
            {erro}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card
            title="Pagamentos por Área"
            subtitle={`Total: ${formatCurrency(totalPagamentosArea)}`}
            variant="primary"
          >
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarPagamentosArea}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600">
                    Preencha os valores nas áreas desejadas e confirme para registrar imediatamente os pagamentos do dia.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPagamentosAreaForm(criarMapaVazio(areaOptions));
                        atualizarMensagem('area', null);
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
                      disabled={areaOptions.length === 0}
                    >
                      Registrar pagamentos
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Área</th>
                        <th className="px-4 py-3 text-left font-semibold w-40">Valor (R$)</th>
                        <th className="px-4 py-3 text-left font-semibold">Descrição</th>
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
                        areaOptions.map((area) => (
                          <tr key={area.id}>
                            <td className="px-4 py-3 font-medium text-gray-700">{area.nome}</td>
                            <td className="px-4 py-3">
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={pagamentosAreaForm[area.id]?.valor ?? ''}
                                onChange={(event) =>
                                  setPagamentosAreaForm((prev) => ({
                                    ...prev,
                                    [area.id]: {
                                      ...(prev[area.id] ?? { valor: '', descricao: '' }),
                                      valor: event.target.value,
                                    },
                                  }))
                                }
                                disabled={processando.area}
                                fullWidth
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="text"
                                placeholder="Descrição (opcional)"
                                value={pagamentosAreaForm[area.id]?.descricao ?? ''}
                                onChange={(event) =>
                                  setPagamentosAreaForm((prev) => ({
                                    ...prev,
                                    [area.id]: {
                                      ...(prev[area.id] ?? { valor: '', descricao: '' }),
                                      descricao: event.target.value,
                                    },
                                  }))
                                }
                                disabled={processando.area}
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

              {resumoPagamentosArea.length > 0 && (
                <div className="rounded-md border border-dashed border-primary-200 p-3 bg-primary-50/40">
                  <h3 className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-2">
                    Resumo por área (hoje)
                  </h3>
                  <ul className="space-y-1">
                    {resumoPagamentosArea.map(([nome, valor]) => (
                      <li key={nome} className="flex justify-between text-sm text-primary-800">
                        <span>{nome}</span>
                        <span>{formatCurrency(valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-gray-200 pt-3">
                {pagamentosArea.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nenhum pagamento registrado hoje
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pagamentosArea.map((pag) => (
                      <li
                        key={pag.pag_id}
                        className="flex justify-between items-start p-3 bg-gray-50 rounded-md"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {pag.are_areas[0]?.are_nome ?? 'Área removida'}
                          </p>
                          <p className="text-sm text-gray-500">{pag.pag_descricao}</p>
                        </div>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(pag.pag_valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <Card
            title="Receitas"
            subtitle={`Total: ${formatCurrency(totalReceitas)}`}
            variant="success"
          >
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarReceitas}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600">
                    Distribua as receitas por tipo e confirme para salvar todas de uma vez.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReceitasForm(criarMapaVazio(contaOptions));
                        atualizarMensagem('receita', null);
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
                      disabled={contaOptions.length === 0}
                    >
                      Registrar receitas
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Conta de receita</th>
                        <th className="px-4 py-3 text-left font-semibold w-40">Valor (R$)</th>
                        <th className="px-4 py-3 text-left font-semibold">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white/80">
                      {contaOptions.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                            Cadastre contas no menu Cadastros &gt; Contas de Receita para liberar esta seção.
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
                                placeholder="0,00"
                                value={receitasForm[conta.id]?.valor ?? ''}
                                onChange={(event) =>
                                  setReceitasForm((prev) => ({
                                    ...prev,
                                    [conta.id]: {
                                      ...(prev[conta.id] ?? { valor: '', descricao: '' }),
                                      valor: event.target.value,
                                    },
                                  }))
                                }
                                disabled={processando.receita}
                                fullWidth
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="text"
                                placeholder="Descrição (opcional)"
                                value={receitasForm[conta.id]?.descricao ?? ''}
                                onChange={(event) =>
                                  setReceitasForm((prev) => ({
                                    ...prev,
                                    [conta.id]: {
                                      ...(prev[conta.id] ?? { valor: '', descricao: '' }),
                                      descricao: event.target.value,
                                    },
                                  }))
                                }
                                disabled={processando.receita}
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

              {resumoReceitas.length > 0 && (
                <div className="rounded-md border border-dashed border-success-200 p-3 bg-success-50/40">
                  <h3 className="text-xs font-semibold text-success-700 uppercase tracking-wide mb-2">
                    Resumo por conta (hoje)
                  </h3>
                  <ul className="space-y-1">
                    {resumoReceitas.map(([nome, valor]) => (
                      <li key={nome} className="flex justify-between text-sm text-success-800">
                        <span>{nome}</span>
                        <span>{formatCurrency(valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-gray-200 pt-3">
                {receitas.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nenhuma receita registrada hoje
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {receitas.map((rec) => (
                      <li
                        key={rec.rec_id}
                        className="flex justify-between items-start p-3 bg-gray-50 rounded-md"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {rec.ctr_contas_receita[0]?.ctr_nome ?? 'Conta removida'}
                          </p>
                          <p className="text-sm text-gray-500">{rec.rec_descricao}</p>
                        </div>
                        <span className="font-semibold text-success-700">
                          {formatCurrency(rec.rec_valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <Card
            title="Pagamentos por Banco"
            subtitle={`Total: ${formatCurrency(totalPagamentosBanco)}`}
            variant="danger"
          >
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarPagamentosBanco}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600">
                    Informe os pagamentos de cada banco e confirme para lançar todos juntos.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPagamentosBancoForm(criarMapaVazio(bancoOptions));
                        atualizarMensagem('banco', null);
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
                      disabled={bancoOptions.length === 0}
                    >
                      Registrar pagamentos
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Banco</th>
                        <th className="px-4 py-3 text-left font-semibold w-40">Valor (R$)</th>
                        <th className="px-4 py-3 text-left font-semibold">Descrição</th>
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
                        bancoOptions.map((banco) => (
                          <tr key={banco.id}>
                            <td className="px-4 py-3 font-medium text-gray-700">{banco.nome}</td>
                            <td className="px-4 py-3">
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={pagamentosBancoForm[banco.id]?.valor ?? ''}
                                onChange={(event) =>
                                  setPagamentosBancoForm((prev) => ({
                                    ...prev,
                                    [banco.id]: {
                                      ...(prev[banco.id] ?? { valor: '', descricao: '' }),
                                      valor: event.target.value,
                                    },
                                  }))
                                }
                                disabled={processando.banco}
                                fullWidth
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="text"
                                placeholder="Descrição (opcional)"
                                value={pagamentosBancoForm[banco.id]?.descricao ?? ''}
                                onChange={(event) =>
                                  setPagamentosBancoForm((prev) => ({
                                    ...prev,
                                    [banco.id]: {
                                      ...(prev[banco.id] ?? { valor: '', descricao: '' }),
                                      descricao: event.target.value,
                                    },
                                  }))
                                }
                                disabled={processando.banco}
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

              {resumoPagamentosBanco.length > 0 && (
                <div className="rounded-md border border-dashed border-error-200 p-3 bg-error-50/50">
                  <h3 className="text-xs font-semibold text-error-700 uppercase tracking-wide mb-2">
                    Resumo por banco (hoje)
                  </h3>
                  <ul className="space-y-1">
                    {resumoPagamentosBanco.map(([nome, valor]) => (
                      <li key={nome} className="flex justify-between text-sm text-error-700">
                        <span>{nome}</span>
                        <span>{formatCurrency(valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-gray-200 pt-3">
                {pagamentosBanco.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nenhum pagamento registrado hoje
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pagamentosBanco.map((pag) => (
                      <li
                        key={pag.pbk_id}
                        className="flex justify-between items-start p-3 bg-gray-50 rounded-md"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {pag.ban_bancos[0]?.ban_nome ?? 'Banco removido'}
                          </p>
                          <p className="text-sm text-gray-500">{pag.pbk_descricao}</p>
                        </div>
                        <span className="font-semibold text-error-700">
                          {formatCurrency(pag.pbk_valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <Card
            title="Saldo por Banco"
            subtitle={`Total: ${formatCurrency(totalSaldos)}`}
            variant="default"
          >
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleRegistrarSaldosBanco}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="data-saldo-referencia">
                        Data de referência
                      </label>
                      <Input
                        id="data-saldo-referencia"
                        type="date"
                        value={dataSaldoReferencia}
                        onChange={(event) => setDataSaldoReferencia(event.target.value)}
                        disabled={processando.saldo}
                      />
                    </div>
                    <p className="text-xs text-gray-500 max-w-sm">
                      Os valores informados serão associados a esta data. Utilize-a para consolidar o fechamento diário.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSaldosBancoForm(criarMapaVazio(bancoOptions));
                        atualizarMensagem('saldo', null);
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
                      disabled={bancoOptions.length === 0}
                    >
                      Atualizar saldos
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Banco</th>
                        <th className="px-4 py-3 text-left font-semibold w-36">Saldo (R$)</th>
                        <th className="px-4 py-3 text-left font-semibold">Descrição</th>
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
                        bancoOptions.map((banco) => (
                          <tr key={banco.id}>
                            <td className="px-4 py-3 font-medium text-gray-700">{banco.nome}</td>
                            <td className="px-4 py-3">
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={saldosBancoForm[banco.id]?.valor ?? ''}
                                onChange={(event) =>
                                  setSaldosBancoForm((prev) => ({
                                    ...prev,
                                    [banco.id]: {
                                      ...(prev[banco.id] ?? { valor: '', descricao: '' }),
                                      valor: event.target.value,
                                    },
                                  }))
                                }
                                disabled={processando.saldo}
                                fullWidth
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="text"
                                placeholder="Descrição (opcional)"
                                value={saldosBancoForm[banco.id]?.descricao ?? ''}
                                onChange={(event) =>
                                  setSaldosBancoForm((prev) => ({
                                    ...prev,
                                    [banco.id]: {
                                      ...(prev[banco.id] ?? { valor: '', descricao: '' }),
                                      descricao: event.target.value,
                                    },
                                  }))
                                }
                                disabled={processando.saldo}
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
                    Nenhum saldo registrado
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {saldosBanco.map((saldo) => (
                      <li
                        key={saldo.sdb_id}
                        className="flex justify-between items-start p-3 bg-gray-50 rounded-md"
                      >
                        <p className="font-medium text-gray-900">
                          {saldo.ban_bancos[0]?.ban_nome ?? 'Banco removido'}
                        </p>
                        <span
                          className={`font-semibold ${
                            saldo.sdb_saldo >= 0 ? 'text-success-700' : 'text-error-700'
                          }`}
                        >
                          {formatCurrency(saldo.sdb_saldo)}
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
