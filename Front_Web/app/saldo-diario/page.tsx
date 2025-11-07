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

type FormPagamentoArea = { areaId: string; valor: string; descricao: string };
type FormReceita = { contaId: string; valor: string; descricao: string };
type FormPagamentoBanco = { bancoId: string; valor: string; descricao: string };
type FormSaldoBanco = { bancoId: string; valor: string; descricao: string; data: string };

type RegistroMensagem = Record<Processo, Mensagem | null>;
type RegistroProcesso = Record<Processo, boolean>;

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

  const [formPagamentoArea, setFormPagamentoArea] = useState<FormPagamentoArea>({
    areaId: '',
    valor: '',
    descricao: '',
  });
  const [formReceita, setFormReceita] = useState<FormReceita>({ contaId: '', valor: '', descricao: '' });
  const [formPagamentoBanco, setFormPagamentoBanco] = useState<FormPagamentoBanco>({
    bancoId: '',
    valor: '',
    descricao: '',
  });
  const [formSaldoBanco, setFormSaldoBanco] = useState<FormSaldoBanco>({
    bancoId: '',
    valor: '',
    descricao: '',
    data: hojePadrao,
  });

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

  const handleRegistrarPagamentoArea = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    const areaId = Number(formPagamentoArea.areaId);
    const valor = parseValorMonetario(formPagamentoArea.valor);

    if (!areaId) {
      atualizarMensagem('area', { tipo: 'erro', texto: 'Selecione uma área para registrar o pagamento.' });
      return;
    }

    if (valor === null || valor <= 0) {
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: 'Informe um valor válido (maior que zero) para o pagamento.',
      });
      return;
    }

    try {
      atualizarProcesso('area', true);
      atualizarMensagem('area', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('pag_pagamentos_area').insert({
        pag_are_id: areaId,
        pag_usr_id: usuario.usr_id,
        pag_valor: valor,
        pag_descricao: formPagamentoArea.descricao.trim() || null,
      });

      if (error) throw error;

      setFormPagamentoArea({ areaId: '', valor: '', descricao: '' });
      atualizarMensagem('area', {
        tipo: 'sucesso',
        texto: 'Pagamento registrado com sucesso.',
      });
      await carregarMovimentacoes(usuario);
    } catch (error) {
      console.error('Erro ao registrar pagamento por área:', error);
      atualizarMensagem('area', {
        tipo: 'erro',
        texto: 'Não foi possível registrar o pagamento. Verifique os dados e tente novamente.',
      });
    } finally {
      atualizarProcesso('area', false);
    }
  };

  const handleRegistrarReceita = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    const contaId = Number(formReceita.contaId);
    const valor = parseValorMonetario(formReceita.valor);

    if (!contaId) {
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: 'Selecione uma conta de receita antes de salvar.',
      });
      return;
    }

    if (valor === null || valor <= 0) {
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: 'Informe um valor válido (maior que zero) para a receita.',
      });
      return;
    }

    try {
      atualizarProcesso('receita', true);
      atualizarMensagem('receita', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('rec_receitas').insert({
        rec_ctr_id: contaId,
        rec_usr_id: usuario.usr_id,
        rec_valor: valor,
        rec_descricao: formReceita.descricao.trim() || null,
      });

      if (error) throw error;

      setFormReceita({ contaId: '', valor: '', descricao: '' });
      atualizarMensagem('receita', {
        tipo: 'sucesso',
        texto: 'Receita registrada com sucesso.',
      });
      await carregarMovimentacoes(usuario);
    } catch (error) {
      console.error('Erro ao registrar receita:', error);
      atualizarMensagem('receita', {
        tipo: 'erro',
        texto: 'Não foi possível registrar a receita. Tente novamente em instantes.',
      });
    } finally {
      atualizarProcesso('receita', false);
    }
  };

  const handleRegistrarPagamentoBanco = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    const bancoId = Number(formPagamentoBanco.bancoId);
    const valor = parseValorMonetario(formPagamentoBanco.valor);

    if (!bancoId) {
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: 'Selecione um banco para vincular o pagamento.',
      });
      return;
    }

    if (valor === null || valor <= 0) {
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: 'Informe um valor válido (maior que zero) para o pagamento.',
      });
      return;
    }

    try {
      atualizarProcesso('banco', true);
      atualizarMensagem('banco', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('pbk_pagamentos_banco').insert({
        pbk_ban_id: bancoId,
        pbk_usr_id: usuario.usr_id,
        pbk_valor: valor,
        pbk_descricao: formPagamentoBanco.descricao.trim() || null,
      });

      if (error) throw error;

      setFormPagamentoBanco({ bancoId: '', valor: '', descricao: '' });
      atualizarMensagem('banco', {
        tipo: 'sucesso',
        texto: 'Pagamento registrado com sucesso.',
      });
      await carregarMovimentacoes(usuario);
    } catch (error) {
      console.error('Erro ao registrar pagamento por banco:', error);
      atualizarMensagem('banco', {
        tipo: 'erro',
        texto: 'Não foi possível registrar o pagamento. Confirme os dados e tente novamente.',
      });
    } finally {
      atualizarProcesso('banco', false);
    }
  };

  const handleRegistrarSaldoBanco = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario) return;

    const bancoId = Number(formSaldoBanco.bancoId);
    const valor = parseValorMonetario(formSaldoBanco.valor);

    if (!bancoId) {
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: 'Selecione um banco antes de registrar o saldo.',
      });
      return;
    }

    if (valor === null) {
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: 'Informe um valor numérico válido para o saldo.',
      });
      return;
    }

    try {
      atualizarProcesso('saldo', true);
      atualizarMensagem('saldo', null);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('sdb_saldo_banco')
        .upsert(
          {
            sdb_ban_id: bancoId,
            sdb_usr_id: usuario.usr_id,
            sdb_saldo: valor,
            sdb_data: formSaldoBanco.data || hojePadrao,
            sdb_descricao: formSaldoBanco.descricao.trim() || null,
          },
          { onConflict: 'sdb_ban_id,sdb_data' }
        );

      if (error) throw error;

      atualizarMensagem('saldo', {
        tipo: 'sucesso',
        texto: 'Saldo atualizado com sucesso.',
      });
      await carregarMovimentacoes(usuario);
    } catch (error) {
      console.error('Erro ao registrar saldo bancário:', error);
      atualizarMensagem('saldo', {
        tipo: 'erro',
        texto: 'Não foi possível registrar o saldo. Tente novamente.',
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
              <form className="space-y-3" onSubmit={handleRegistrarPagamentoArea}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Área
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={formPagamentoArea.areaId}
                      onChange={(event) =>
                        setFormPagamentoArea((prev) => ({ ...prev, areaId: event.target.value }))
                      }
                      disabled={processando.area || areaOptions.length === 0}
                    >
                      <option value="">Selecione uma área</option>
                      {areaOptions.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.nome}
                        </option>
                      ))}
                    </select>
                    {areaOptions.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        Cadastre áreas no menu Cadastros &gt; Áreas para liberar esta opção.
                      </p>
                    )}
                  </div>

                  <Input
                    label="Valor"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formPagamentoArea.valor}
                    onChange={(event) =>
                      setFormPagamentoArea((prev) => ({ ...prev, valor: event.target.value }))
                    }
                    disabled={processando.area}
                  />
                </div>

                <Input
                  label="Descrição"
                  placeholder="Descreva rapidamente o pagamento"
                  value={formPagamentoArea.descricao}
                  onChange={(event) =>
                    setFormPagamentoArea((prev) => ({ ...prev, descricao: event.target.value }))
                  }
                  disabled={processando.area}
                />

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

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={processando.area}
                    disabled={areaOptions.length === 0}
                  >
                    Registrar pagamento
                  </Button>
                </div>
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
              <form className="space-y-3" onSubmit={handleRegistrarReceita}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Conta de receita
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-success-500"
                      value={formReceita.contaId}
                      onChange={(event) =>
                        setFormReceita((prev) => ({ ...prev, contaId: event.target.value }))
                      }
                      disabled={processando.receita || contaOptions.length === 0}
                    >
                      <option value="">Selecione uma conta</option>
                      {contaOptions.map((conta) => (
                        <option key={conta.id} value={conta.id}>
                          {conta.nome}
                        </option>
                      ))}
                    </select>
                    {contaOptions.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        Cadastre contas no menu Cadastros &gt; Contas de Receita para liberar esta opção.
                      </p>
                    )}
                  </div>

                  <Input
                    label="Valor"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formReceita.valor}
                    onChange={(event) =>
                      setFormReceita((prev) => ({ ...prev, valor: event.target.value }))
                    }
                    disabled={processando.receita}
                  />
                </div>

                <Input
                  label="Descrição"
                  placeholder="Descreva a origem da receita"
                  value={formReceita.descricao}
                  onChange={(event) =>
                    setFormReceita((prev) => ({ ...prev, descricao: event.target.value }))
                  }
                  disabled={processando.receita}
                />

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

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={processando.receita}
                    disabled={contaOptions.length === 0}
                  >
                    Registrar receita
                  </Button>
                </div>
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
              <form className="space-y-3" onSubmit={handleRegistrarPagamentoBanco}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Banco
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-error-500"
                      value={formPagamentoBanco.bancoId}
                      onChange={(event) =>
                        setFormPagamentoBanco((prev) => ({ ...prev, bancoId: event.target.value }))
                      }
                      disabled={processando.banco || bancoOptions.length === 0}
                    >
                      <option value="">Selecione um banco</option>
                      {bancoOptions.map((banco) => (
                        <option key={banco.id} value={banco.id}>
                          {banco.nome}
                        </option>
                      ))}
                    </select>
                    {bancoOptions.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        Cadastre bancos no menu Cadastros &gt; Bancos para liberar esta opção.
                      </p>
                    )}
                  </div>

                  <Input
                    label="Valor"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formPagamentoBanco.valor}
                    onChange={(event) =>
                      setFormPagamentoBanco((prev) => ({ ...prev, valor: event.target.value }))
                    }
                    disabled={processando.banco}
                  />
                </div>

                <Input
                  label="Descrição"
                  placeholder="Descreva o pagamento"
                  value={formPagamentoBanco.descricao}
                  onChange={(event) =>
                    setFormPagamentoBanco((prev) => ({ ...prev, descricao: event.target.value }))
                  }
                  disabled={processando.banco}
                />

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

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={processando.banco}
                    disabled={bancoOptions.length === 0}
                  >
                    Registrar pagamento
                  </Button>
                </div>
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
              <form className="space-y-3" onSubmit={handleRegistrarSaldoBanco}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Banco
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={formSaldoBanco.bancoId}
                      onChange={(event) =>
                        setFormSaldoBanco((prev) => ({ ...prev, bancoId: event.target.value }))
                      }
                      disabled={processando.saldo || bancoOptions.length === 0}
                    >
                      <option value="">Selecione um banco</option>
                      {bancoOptions.map((banco) => (
                        <option key={banco.id} value={banco.id}>
                          {banco.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Input
                    label="Data"
                    type="date"
                    value={formSaldoBanco.data}
                    onChange={(event) =>
                      setFormSaldoBanco((prev) => ({ ...prev, data: event.target.value }))
                    }
                    disabled={processando.saldo}
                  />

                  <Input
                    label="Saldo"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formSaldoBanco.valor}
                    onChange={(event) =>
                      setFormSaldoBanco((prev) => ({ ...prev, valor: event.target.value }))
                    }
                    disabled={processando.saldo}
                  />
                </div>

                <Input
                  label="Descrição"
                  placeholder="Observações sobre o saldo"
                  value={formSaldoBanco.descricao}
                  onChange={(event) =>
                    setFormSaldoBanco((prev) => ({ ...prev, descricao: event.target.value }))
                  }
                  disabled={processando.saldo}
                />

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

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={processando.saldo}
                    disabled={bancoOptions.length === 0}
                  >
                    Atualizar saldo
                  </Button>
                </div>
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
