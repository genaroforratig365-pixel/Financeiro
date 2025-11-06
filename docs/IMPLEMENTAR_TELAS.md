# Guia de Implementação das Telas Restantes

## ✅ Telas Já Criadas

1. **Saldo Diário** (`/app/saldo-diario/page.tsx`) - ✅ Completa
   - Dashboard com 4 blocos
   - Pagamentos por Área
   - Receitas
   - Pagamentos por Banco
   - Saldo por Banco

2. **Áreas - Listagem** (`/app/cadastros/areas/page.tsx`) - ✅ Completa
   - Listagem com busca e filtros
   - Tabela ordenável
   - Ações: editar e excluir

## 📝 Telas a Implementar

### 1. Áreas - Formulário (Criar/Editar)

**Arquivo:** `/app/cadastros/areas/[id]/page.tsx` e `/app/cadastros/areas/novo/page.tsx`

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Header } from '@/components/layout';
import { Button, Input, Card } from '@/components/ui';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

export default function AreaFormPage() {
  const router = useRouter();
  const params = useParams();
  const isEdit = params?.id !== 'novo';

  const [form, setForm] = useState({
    are_codigo: '',
    are_nome: '',
    are_descricao: '',
    are_ativo: true,
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isEdit) {
      loadArea();
    }
  }, []);

  const loadArea = async () => {
    // Carregar dados da área para edição
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('are_areas')
      .select('*')
      .eq('are_id', params.id)
      .single();

    if (data) {
      setForm({
        are_codigo: data.are_codigo,
        are_nome: data.are_nome,
        are_descricao: data.are_descricao || '',
        are_ativo: data.are_ativo,
      });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!form.are_codigo.trim()) {
      newErrors.are_codigo = 'Código é obrigatório';
    }
    if (!form.are_nome.trim()) {
      newErrors.are_nome = 'Nome é obrigatório';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      setLoading(true);
      const { userId } = getUserSession();
      const supabase = getSupabaseClient();
      const { data: user } = await getOrCreateUser(supabase, userId);

      if (!user) return;

      if (isEdit) {
        // Atualizar
        await supabase
          .from('are_areas')
          .update(form)
          .eq('are_id', params.id);
      } else {
        // Criar
        await supabase
          .from('are_areas')
          .insert({ ...form, are_usr_id: user.usr_id });
      }

      router.push('/cadastros/areas');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar área');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header
        title={isEdit ? 'Editar Área' : 'Nova Área'}
        subtitle="Cadastro de área de negócio"
      />

      <div className="page-content max-w-2xl">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Código"
              value={form.are_codigo}
              onChange={(e) => setForm({ ...form, are_codigo: e.target.value })}
              placeholder="VEN001"
              required
              error={errors.are_codigo}
              fullWidth
            />

            <Input
              label="Nome"
              value={form.are_nome}
              onChange={(e) => setForm({ ...form, are_nome: e.target.value })}
              placeholder="Vendas"
              required
              error={errors.are_nome}
              fullWidth
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição
              </label>
              <textarea
                value={form.are_descricao}
                onChange={(e) => setForm({ ...form, are_descricao: e.target.value })}
                placeholder="Descrição da área..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.are_ativo}
                onChange={(e) => setForm({ ...form, are_ativo: e.target.checked })}
                className="w-4 h-4 text-primary-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Ativo</span>
            </label>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.back()}
                fullWidth
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                fullWidth
              >
                {isEdit ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
```

### 2. Contas de Receita

Seguir o mesmo padrão de Áreas:

**Listagem:** `/app/cadastros/contas-receita/page.tsx`
- Copiar de `areas/page.tsx`
- Substituir:
  - `are_areas` → `ctr_contas_receita`
  - `are_` → `ctr_`
  - Ajustar títulos e labels

**Formulário:** `/app/cadastros/contas-receita/[id]/page.tsx` e `/novo/page.tsx`
- Mesma estrutura de áreas
- Campos: código, nome, descrição, ativo

### 3. Bancos

**Listagem:** `/app/cadastros/bancos/page.tsx`
- Copiar de `areas/page.tsx`
- Substituir:
  - `are_areas` → `ban_bancos`
  - `are_` → `ban_`

**Formulário:** `/app/cadastros/bancos/[id]/page.tsx` e `/novo/page.tsx`
- Campos específicos:
  ```tsx
  const [form, setForm] = useState({
    ban_codigo: '',
    ban_nome: '',
    ban_numero_conta: '',
    ban_agencia: '',
    ban_tipo_conta: 'Corrente',
    ban_saldo_inicial: '0',
    ban_ativo: true,
  });
  ```
- Adicionar MathInput para `ban_saldo_inicial`:
  ```tsx
  import { MathInput } from '@/components/forms/MathInput';

  <MathInput
    label="Saldo Inicial"
    value={form.ban_saldo_inicial}
    onChange={(value) => setForm({ ...form, ban_saldo_inicial: value })}
    placeholder="0.00"
  />
  ```

### 4. Modals para Saldo Diário

Criar componentes de modal para adicionar registros em `/components/saldo-diario/`:

#### `AddPagamentoAreaModal.tsx`
```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';
import { MathInput } from '@/components/forms/MathInput';
import { getSupabaseClient, getOrCreateUser } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddPagamentoAreaModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [areas, setAreas] = useState([]);
  const [form, setForm] = useState({
    area_id: '',
    valor: '',
    descricao: '',
  });

  useEffect(() => {
    if (isOpen) loadAreas();
  }, [isOpen]);

  const loadAreas = async () => {
    const { userId } = getUserSession();
    const supabase = getSupabaseClient();
    const { data: user } = await getOrCreateUser(supabase, userId);

    const { data } = await supabase
      .from('are_areas')
      .select('are_id, are_codigo, are_nome')
      .eq('are_usr_id', user.usr_id)
      .eq('are_ativo', true);

    setAreas(data || []);
  };

  const handleSubmit = async () => {
    const { userId } = getUserSession();
    const supabase = getSupabaseClient();
    const { data: user } = await getOrCreateUser(supabase, userId);

    await supabase.from('pag_pagamentos_area').insert({
      pag_are_id: form.area_id,
      pag_valor: parseFloat(form.valor),
      pag_descricao: form.descricao,
      pag_data: new Date().toISOString().split('T')[0],
      pag_usr_id: user.usr_id,
    });

    onSuccess();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adicionar Pagamento por Área"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Área *
          </label>
          <select
            value={form.area_id}
            onChange={(e) => setForm({ ...form, area_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          >
            <option value="">Selecione...</option>
            {areas.map((area: any) => (
              <option key={area.are_id} value={area.are_id}>
                {area.are_codigo} - {area.are_nome}
              </option>
            ))}
          </select>
        </div>

        <MathInput
          label="Valor"
          value={form.valor}
          onChange={(value) => setForm({ ...form, valor: value })}
          required
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descrição
          </label>
          <textarea
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>
    </Modal>
  );
};
```

Criar modais similares para:
- `AddReceitaModal.tsx`
- `AddPagamentoBancoModal.tsx`
- `AddSaldoBancoModal.tsx`

## 🎯 Checklist de Implementação

- [ ] Formulário de Áreas (criar e editar)
- [ ] Listagem de Contas de Receita
- [ ] Formulário de Contas de Receita
- [ ] Listagem de Bancos
- [ ] Formulário de Bancos
- [ ] Modal AddPagamentoAreaModal
- [ ] Modal AddReceitaModal
- [ ] Modal AddPagamentoBancoModal
- [ ] Modal AddSaldoBancoModal
- [ ] Integrar modais na tela Saldo Diário
- [ ] Testar CRUD completo de todas as entidades
- [ ] Testar calculadora nos campos de valor
- [ ] Testar responsividade em mobile

## 📦 Estrutura Final de Pastas

```
Front_Web/
├── app/
│   ├── saldo-diario/
│   │   └── page.tsx ✅
│   ├── cadastros/
│   │   ├── areas/
│   │   │   ├── page.tsx ✅
│   │   │   ├── novo/
│   │   │   │   └── page.tsx ⏳
│   │   │   └── [id]/
│   │   │       └── page.tsx ⏳
│   │   ├── contas-receita/
│   │   │   ├── page.tsx ⏳
│   │   │   ├── novo/page.tsx ⏳
│   │   │   └── [id]/page.tsx ⏳
│   │   └── bancos/
│   │       ├── page.tsx ⏳
│   │       ├── novo/page.tsx ⏳
│   │       └── [id]/page.tsx ⏳
│   ├── layout.tsx ✅
│   └── page.tsx ✅
├── components/
│   ├── ui/ ✅ (todos)
│   ├── forms/
│   │   └── MathInput.tsx ✅
│   ├── layout/ ✅ (todos)
│   └── saldo-diario/
│       ├── AddPagamentoAreaModal.tsx ⏳
│       ├── AddReceitaModal.tsx ⏳
│       ├── AddPagamentoBancoModal.tsx ⏳
│       └── AddSaldoBancoModal.tsx ⏳
├── lib/
│   ├── supabaseClient.ts ✅
│   ├── userSession.ts ✅
│   └── mathParser.ts ✅
└── styles/
    └── globals.css ✅
```

## 🚀 Como Continuar

1. Criar os formulários de áreas (novo e editar)
2. Replicar para contas de receita e bancos
3. Criar os 4 modais de adicionar para Saldo Diário
4. Testar todas as funcionalidades
5. Ajustar estilos e responsividade
6. Deploy final

## 💡 Dicas

- **Reutilização:** Os formulários são muito similares, copie e ajuste
- **Validação:** Use a mesma lógica de validação em todos
- **MathInput:** Use sempre que tiver campo de valor monetário
- **Loading States:** Sempre mostre feedback visual durante operações
- **Error Handling:** Sempre trate erros e mostre mensagens claras
- **TypeScript:** Crie interfaces para todos os tipos de dados

✅ **Legenda:** ✅ Implementado | ⏳ Pendente
