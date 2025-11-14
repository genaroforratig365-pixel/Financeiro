# CLAUDE.md - AI Assistant Guide for Financeiro

**Last Updated:** 2025-11-14
**Repository:** EquipeGF2/Financeiro
**Production URL:** https://financeiro-germani.vercel.app

This document provides comprehensive guidance for AI assistants working on the Financeiro (Financial Management System) codebase.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Schema & Conventions](#database-schema--conventions)
5. [Code Patterns & Conventions](#code-patterns--conventions)
6. [Key Features & Implementation](#key-features--implementation)
7. [Development Workflows](#development-workflows)
8. [Common Tasks](#common-tasks)
9. [Important Gotchas](#important-gotchas)
10. [Testing & Debugging](#testing--debugging)

---

## System Overview

### What is Financeiro?

A financial management system for Germani Alimentos that tracks:
- Daily payments by business area
- Revenue by accounts
- Bank payments and balances
- Billing and collections
- Weekly cash flow forecasts

### Key Characteristics

- **No Traditional Authentication:** Uses session-based UUID system (localStorage)
- **All Client-Side Rendering:** Next.js App Router with client components
- **PostgreSQL Backend:** Via Supabase with custom `financas` schema
- **Red & White Theme:** Brand colors from Germani Alimentos
- **Calculator Feature:** Math expressions in all monetary input fields
- **Audit Trail:** All tables track who/when via `usr_id` and timestamps

### Architecture Flow

```
User Browser (UUID in localStorage)
    ↓
Next.js 14 App (Vercel)
    ↓
Supabase Client (with x-user-id header)
    ↓
PostgreSQL Database (schema: financas)
    ↓
Row Level Security (filters by session UUID)
```

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.2.4 | App Router framework |
| React | 18.2.0 | UI library |
| TypeScript | 5.4.0 | Type safety |
| Tailwind CSS | 3.4.4 | Styling |
| jsPDF | 3.0.3 | PDF generation |
| jspdf-autotable | 5.0.2 | PDF tables |
| xlsx | 0.18.5 | Excel import |
| @supabase/supabase-js | 2.45.0 | Database client |

### Backend & DevOps

- **Database:** PostgreSQL via Supabase Cloud
- **Schema:** `financas` (all tables in one schema)
- **Deployment:** Vercel (auto-deploy from `main`)
- **CI/CD:** GitHub Actions (migrations + type generation)
- **Package Manager:** npm

### Development Tools

- ESLint 8.57.0
- PostCSS 8.4.38 + Autoprefixer 10.4.19
- Supabase CLI (for migrations)

---

## Project Structure

### Root Directory

```
Financeiro/
├── Front_Web/              # Next.js application (main frontend)
├── supabase/               # Database migrations
│   └── migrations/         # 25+ SQL migration files
├── .github/workflows/      # CI/CD pipelines
├── docs/                   # Comprehensive documentation
├── scripts/                # Utility scripts
├── templates/              # Template files
├── config/                 # Configuration files
├── README.md               # Project overview
├── SALDO_INICIAL.md        # Initial balance setup guide
└── CLAUDE.md               # This file
```

### Frontend Structure (Front_Web/)

```
Front_Web/
├── app/                    # Next.js 14 App Router
│   ├── dashboard/          # Landing page after login
│   ├── saldo-diario/       # Main operational screen (4 blocks)
│   ├── cadastros/          # Master data CRUD modules
│   │   ├── areas/          # Business areas
│   │   ├── contas-receita/ # Revenue accounts
│   │   ├── tipos-receita/  # Revenue types
│   │   ├── bancos/         # Banks & accounts
│   │   └── usuarios/       # Users (session-based)
│   ├── pagamentos/         # Payments module
│   ├── recebimentos/       # Receipts/revenues module
│   ├── cobrancas/          # Billing module
│   ├── previsao-semanal/   # Weekly forecast
│   ├── previsto-realizado/ # Budget vs Actual
│   ├── relatorios/         # Reports
│   │   ├── saldo-diario/   # Daily balance report
│   │   ├── cobranca/       # Billing report
│   │   └── previsao-semanal/ # Forecast report
│   ├── auditoria/          # Audit trails
│   ├── admin/              # Admin functions
│   │   ├── importar/       # Historical data import
│   │   └── importar-grid/  # Weekly forecast import
│   ├── api/                # API routes
│   │   ├── health/         # Health check
│   │   ├── importar-historico/ # Import API
│   │   └── importar-dados-grid/ # Grid import API
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Homepage redirect
│
├── components/             # React components
│   ├── ui/                 # Design system components
│   │   ├── Button.tsx      # Primary button component
│   │   ├── Input.tsx       # Text input
│   │   ├── Card.tsx        # Card container
│   │   ├── Table.tsx       # Data table
│   │   ├── Modal.tsx       # Modal dialog
│   │   ├── Loading.tsx     # Loading spinner
│   │   ├── Textarea.tsx    # Multi-line input
│   │   ├── Toast.tsx       # Toast notifications
│   │   └── index.ts        # Barrel exports
│   ├── forms/              # Form components
│   │   ├── AreaForm.tsx    # Area create/edit form
│   │   ├── ContaReceitaForm.tsx # Revenue account form
│   │   ├── BancoForm.tsx   # Bank form
│   │   └── MathInput.tsx   # Calculator input
│   └── layout/             # Layout components
│       ├── Header.tsx      # Top navigation
│       ├── Sidebar.tsx     # Left sidebar menu
│       ├── UserIdentifier.tsx # User session display
│       └── RequireUser.tsx # Auth wrapper
│
├── lib/                    # Utilities and clients
│   ├── supabaseClient.ts   # Supabase client factory
│   ├── supabaseServer.ts   # Server-side client
│   ├── userSession.ts      # Session management
│   ├── supabaseErrors.ts   # Error translation
│   └── mathParser.ts       # Calculator logic
│
├── styles/                 # Global CSS
│   └── globals.css         # Tailwind + custom styles
│
├── public/                 # Static assets
├── next.config.js          # Next.js configuration
├── tailwind.config.js      # Tailwind configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies
```

### Key File Locations

| What | Where | Example |
|------|-------|---------|
| Pages | `app/{module}/page.tsx` | `app/cadastros/areas/page.tsx` |
| API Routes | `app/api/{name}/route.ts` | `app/api/health/route.ts` |
| UI Components | `components/ui/{Component}.tsx` | `components/ui/Button.tsx` |
| Form Components | `components/forms/{Component}.tsx` | `components/forms/MathInput.tsx` |
| Layout Components | `components/layout/{Component}.tsx` | `components/layout/Header.tsx` |
| Database Client | `lib/supabaseClient.ts` | - |
| Utilities | `lib/{utility}.ts` | `lib/mathParser.ts` |
| Migrations | `supabase/migrations/*.sql` | `20251106000100_create_user_tables.sql` |
| Documentation | `docs/*.md` | `docs/ARQUITETURA.md` |

---

## Database Schema & Conventions

### Schema Name

**All tables use the `financas` schema** (not `public`)

```sql
CREATE TABLE financas.are_areas (...);
```

### Table Naming Convention

**Three-letter prefix system:**

| Prefix | Entity | Example Table |
|--------|--------|---------------|
| `usr_` | Users | `usr_usuarios` |
| `are_` | Areas | `are_areas` |
| `ctr_` | Revenue Accounts | `ctr_contas_receita` |
| `tpr_` | Revenue Types | `tpr_tipos_receita` |
| `ban_` | Banks | `ban_bancos` |
| `pag_` | Payments by Area | `pag_pagamentos_area` |
| `rec_` | Revenues | `rec_receitas` |
| `pbk_` | Bank Payments | `pbk_pagamentos_banco` |
| `sdb_` | Bank Balances | `sdb_saldo_banco` |
| `cob_` | Billings | `cob_cobrancas` |
| `pvs_` | Weekly Forecast Header | `pvs_semanas` |
| `pvi_` | Forecast Items | `pvi_previsao_itens` |
| `sdd_` | Daily Balance Snapshot | `sdd_saldo_diario` |

### Column Naming Convention

All columns follow the pattern: `{table_prefix}_{field_name}`

**Examples:**
```sql
-- Areas table (prefix: are_)
are_id          -- Primary key
are_codigo      -- Code/identifier
are_nome        -- Name
are_descricao   -- Description
are_ativo       -- Active flag
are_usr_id      -- User foreign key
are_criado_em   -- Created timestamp
are_atualizado_em -- Updated timestamp

-- Revenue accounts (prefix: ctr_)
ctr_id
ctr_codigo
ctr_nome
ctr_ban_id      -- Bank foreign key (optional)
ctr_usr_id
ctr_criado_em
ctr_atualizado_em
```

### Standard Audit Fields

**Every table MUST have these fields:**

```sql
{prefix}_usr_id uuid NOT NULL
    REFERENCES financas.usr_usuarios(usr_id),
{prefix}_criado_em timestamptz DEFAULT now(),
{prefix}_atualizado_em timestamptz DEFAULT now()
```

### Auto-Update Trigger Pattern

**Every table has a trigger to update `{prefix}_atualizado_em`:**

```sql
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_{table}()
RETURNS TRIGGER AS $$
BEGIN
  NEW.{prefix}_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_timestamp_{table}
  BEFORE UPDATE ON financas.{table}
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_{table}();
```

### Key Tables

#### Master Tables (Cadastros)

1. **usr_usuarios** - Session-based users
   - No password/auth
   - UUID-based identification
   - Optional name/email for display

2. **are_areas** - Business areas/departments
   - Unique code per user
   - Active/inactive flag

3. **ctr_contas_receita** - Revenue accounts
   - Can optionally link to a bank (`ctr_ban_id`)
   - Unique code per user

4. **tpr_tipos_receita** - Revenue types (categories)
   - Simple classification system

5. **ban_bancos** - Banks and bank accounts
   - Unique code per user

#### Transaction Tables (Movimentação)

1. **pag_pagamentos_area** - Daily payments by area
   - Links to area (`pag_are_id`)
   - Amount and description
   - Date-based

2. **rec_receitas** - Revenues by account
   - Links to revenue account (`rec_ctr_id`)
   - Links to revenue type (`rec_tpr_id`)
   - Amount and description

3. **pbk_pagamentos_banco** - Bank payments (debits)
   - Links to bank (`pbk_ban_id`)
   - Tracks money leaving bank accounts

4. **sdb_saldo_banco** - Bank balances
   - **UNIQUE constraint:** One balance per bank per day
   - `UNIQUE(sdb_ban_id, sdb_data)`

5. **cob_cobrancas** - Billings/receivables
   - Links to revenue account and type
   - Tracks amounts to be received

#### Forecast Tables

1. **pvs_semanas** - Weekly forecast headers
   - Start date, end date, description
   - Container for forecast items

2. **pvi_previsao_itens** - Forecast line items
   - Links to week (`pvi_pvs_id`)
   - Can link to area or revenue account
   - Imported from Excel grids

#### Snapshot Tables

1. **sdd_saldo_diario** - Daily balance snapshots
   - Used for historical reporting
   - Captures point-in-time state

### Row Level Security (RLS)

**All tables use RLS policies based on session UUID:**

```sql
-- Enable RLS
ALTER TABLE financas.{table} ENABLE ROW LEVEL SECURITY;

-- Policy: Users see only their data
CREATE POLICY "{table}_usuarios_veem_seus_dados"
  ON financas.{table} FOR SELECT
  USING ({prefix}_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- Policy: Users insert with their ID
CREATE POLICY "{table}_usuarios_inserem_seus_dados"
  ON financas.{table} FOR INSERT
  WITH CHECK ({prefix}_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- Similar policies for UPDATE and DELETE
```

**How it works:**
1. Supabase client sends `x-user-id` header (session UUID)
2. RLS policy reads header via `current_setting('request.headers')`
3. Looks up `usr_id` from `usr_usuarios` table
4. Filters results to match `usr_id`

### Monetary Value Constraints

**All money fields have `CHECK` constraints:**

```sql
{prefix}_valor numeric(15,2) NOT NULL CHECK ({prefix}_valor >= 0)
```

---

## Code Patterns & Conventions

### Import Organization

**Always organize imports in this order:**

```typescript
// 1. React imports
import React, { useState, useEffect } from 'react';

// 2. Next.js imports
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

// 3. Component imports (aliased with @/)
import { Header } from '@/components/layout';
import { Button, Card, Table } from '@/components/ui';
import { AreaForm } from '@/components/forms';

// 4. Library/utility imports
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { formatCurrency } from '@/lib/mathParser';

// 5. Type imports (if separate)
import type { Database } from '@/lib/database.types';
```

### Component Structure

**Standard component file structure:**

```typescript
/**
 * ComponentName
 * Brief description of what this component does
 */

'use client'; // Only if client component (most are)

// Imports (see order above)

// Type/Interface definitions
export interface ComponentNameProps {
  prop1: string;
  prop2?: number;
  onAction?: () => void;
}

// Constants (if any)
const CONSTANT_VALUE = 'value';

// Main component
export const ComponentName: React.FC<ComponentNameProps> = ({
  prop1,
  prop2 = 0,
  onAction
}) => {
  // 1. State hooks
  const [state, setState] = useState<Type>(initialValue);
  const [loading, setLoading] = useState(false);

  // 2. Router/navigation hooks
  const router = useRouter();
  const pathname = usePathname();

  // 3. Effect hooks
  useEffect(() => {
    // Effect logic
  }, [dependencies]);

  // 4. Event handlers
  const handleAction = async () => {
    try {
      setLoading(true);
      // Logic here
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // 5. Derived values (useMemo if needed)
  const computedValue = useMemo(() => {
    return complexCalculation(state);
  }, [state]);

  // 6. Early returns (loading, error states)
  if (loading) {
    return <Loading />;
  }

  // 7. Main JSX return
  return (
    <div className="container">
      {/* Component JSX */}
    </div>
  );
};

// Display name for debugging
ComponentName.displayName = 'ComponentName';

// Default export
export default ComponentName;
```

### Client vs Server Components

**Most components are client components** due to interactivity needs:

```typescript
'use client'; // Add this directive at the top

// Client components can:
// - Use useState, useEffect
// - Handle user interactions
// - Access browser APIs (localStorage)
// - Use Supabase client
```

**Server components** (rare in this codebase):
- No 'use client' directive
- Cannot use hooks
- Cannot access browser APIs
- Good for static content only

### Database Access Patterns

#### Pattern 1: Client Component with Supabase Client

**Most common pattern in this codebase:**

```typescript
'use client';

import { getSupabaseClient } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';

export default function MyPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const supabase = getSupabaseClient(); // Includes x-user-id automatically

      const { data, error } = await supabase
        .from('are_areas')
        .select('*')
        .order('are_codigo', { ascending: true });

      if (error) throw error;
      setData(data || []);
    } catch (error) {
      console.error('Erro ao carregar:', error);
    } finally {
      setLoading(false);
    }
  };

  // Rest of component...
}
```

#### Pattern 2: Insert with User ID

```typescript
const handleSubmit = async () => {
  try {
    setLoading(true);
    const supabase = getSupabaseClient();
    const { userId } = getUserSession();

    const { error } = await supabase
      .from('are_areas')
      .insert({
        are_codigo: codigo,
        are_nome: nome,
        are_descricao: descricao,
        are_ativo: true,
        are_usr_id: userId, // Required!
      });

    if (error) throw error;

    // Success handling
    alert('Área cadastrada com sucesso!');
    router.push('/cadastros/areas');
  } catch (error) {
    const mensagem = traduzirErroSupabase(
      error,
      'Erro ao cadastrar área'
    );
    alert(mensagem);
  } finally {
    setLoading(false);
  }
};
```

#### Pattern 3: Update

```typescript
const handleUpdate = async () => {
  try {
    setLoading(true);
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('are_areas')
      .update({
        are_nome: nome,
        are_descricao: descricao,
        are_ativo: ativo,
        // are_atualizado_em updates automatically via trigger
      })
      .eq('are_id', areaId);

    if (error) throw error;
    // Success handling
  } catch (error) {
    console.error('Erro ao atualizar:', error);
  } finally {
    setLoading(false);
  }
};
```

#### Pattern 4: Delete

```typescript
const handleDelete = async (id: number) => {
  if (!confirm('Tem certeza que deseja excluir?')) return;

  try {
    setLoading(true);
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('are_areas')
      .delete()
      .eq('are_id', id);

    if (error) throw error;

    // Refresh data
    await carregarDados();
  } catch (error) {
    console.error('Erro ao excluir:', error);
  } finally {
    setLoading(false);
  }
};
```

#### Pattern 5: Queries with Joins

```typescript
const { data, error } = await supabase
  .from('rec_receitas')
  .select(`
    *,
    ctr_contas_receita (
      ctr_codigo,
      ctr_nome
    ),
    tpr_tipos_receita (
      tpr_nome
    )
  `)
  .order('rec_data', { ascending: false });
```

### State Management

**No global state library** - using React local state only:

- `useState` for component state
- `useEffect` for data fetching
- Props for parent-child communication
- **No Redux, Zustand, or Context API**

### Form Handling

#### Controlled Components Pattern

```typescript
const [codigo, setCodigo] = useState('');
const [nome, setNome] = useState('');
const [ativo, setAtivo] = useState(true);

return (
  <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
    <Input
      label="Código"
      value={codigo}
      onChange={(e) => setCodigo(e.target.value)}
      required
    />

    <Input
      label="Nome"
      value={nome}
      onChange={(e) => setNome(e.target.value)}
      required
    />

    <label>
      <input
        type="checkbox"
        checked={ativo}
        onChange={(e) => setAtivo(e.target.checked)}
      />
      Ativo
    </label>

    <Button type="submit" disabled={loading}>
      {loading ? 'Salvando...' : 'Salvar'}
    </Button>
  </form>
);
```

#### Math Input for Monetary Fields

**Always use `MathInput` for money fields:**

```typescript
import { MathInput } from '@/components/forms';

const [valor, setValor] = useState('');

<MathInput
  label="Valor"
  value={valor}
  onChange={(e) => setValor(e.target.value)}
  placeholder="Digite o valor ou cálculo (ex: 100+50)"
/>
```

### Error Handling

#### Pattern 1: Try-Catch with Translation

```typescript
import { traduzirErroSupabase } from '@/lib/supabaseErrors';

try {
  // Supabase operation
} catch (error) {
  const mensagem = traduzirErroSupabase(
    error,
    'Mensagem padrão se erro desconhecido'
  );
  alert(mensagem); // Or use Toast component
  console.error('Detalhes do erro:', error);
}
```

#### Pattern 2: Loading States

```typescript
const [loading, setLoading] = useState(false);

const handleAction = async () => {
  try {
    setLoading(true);
    // Operation
  } catch (error) {
    // Error handling
  } finally {
    setLoading(false); // Always runs
  }
};

// In JSX
if (loading) return <Loading />;
```

#### Pattern 3: Empty States

```typescript
<Table
  data={areas}
  columns={columns}
  emptyMessage={
    searchTerm
      ? `Nenhuma área encontrada com "${searchTerm}"`
      : 'Nenhuma área cadastrada. Clique em "Nova Área" para começar.'
  }
/>
```

### Styling with Tailwind CSS

#### Utility Classes Pattern

```typescript
<div className="flex items-center justify-between gap-4 px-6 py-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
  {/* Content */}
</div>
```

#### Conditional Classes

```typescript
const buttonClasses = `
  px-4 py-2 rounded-md font-medium transition-colors
  ${variant === 'primary'
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  }
  ${disabled
    ? 'opacity-50 cursor-not-allowed'
    : 'hover:shadow-lg cursor-pointer'
  }
`.replace(/\s+/g, ' ').trim();
```

#### Brand Colors

**Use these Tailwind classes for Germani Alimentos brand:**

- **Primary (Red):** `bg-red-600`, `text-red-600`, `border-red-600`
- **Primary Hover:** `hover:bg-red-700`
- **Primary Light:** `bg-red-50`, `bg-red-100`
- **Success:** `bg-green-600`, `text-green-600`
- **Warning:** `bg-yellow-600`, `text-yellow-600`
- **Error:** `bg-red-600`, `text-red-600`
- **Info:** `bg-blue-600`, `text-blue-600`
- **Neutral:** `bg-gray-100`, `bg-gray-200`, `text-gray-600`

### Component Export Pattern

**Use barrel exports for clean imports:**

```typescript
// components/ui/index.ts
export { Button } from './Button';
export type { ButtonProps } from './Button';
export { Input } from './Input';
export type { InputProps } from './Input';
export { Card } from './Card';
export { Table } from './Table';
export { Modal } from './Modal';
export { Loading } from './Loading';
// ... etc
```

**Then import like:**

```typescript
import { Button, Input, Card } from '@/components/ui';
```

---

## Key Features & Implementation

### 1. Session-Based Authentication (No Login)

#### How It Works

1. **UUID Generation:**
   ```typescript
   // lib/userSession.ts
   export function getUserSession() {
     if (typeof window === 'undefined') {
       return { userId: '', userName: '', userEmail: '' };
     }

     let userId = localStorage.getItem('userId');
     if (!userId) {
       userId = crypto.randomUUID();
       localStorage.setItem('userId', userId);
     }

     const userName = localStorage.getItem('userName') || '';
     const userEmail = localStorage.getItem('userEmail') || '';

     return { userId, userName, userEmail };
   }
   ```

2. **User Record Creation:**
   ```typescript
   // lib/supabaseClient.ts
   export async function getOrCreateUser(
     supabase: SupabaseClient,
     userId: string,
     userName?: string,
     userEmail?: string
   ) {
     // Check if user exists
     const { data: existing } = await supabase
       .from('usr_usuarios')
       .select('*')
       .eq('usr_identificador', userId)
       .single();

     if (existing) return { data: existing };

     // Create new user
     const { data, error } = await supabase
       .from('usr_usuarios')
       .insert({
         usr_identificador: userId,
         usr_nome: userName || `Usuário ${userId.slice(0, 8)}`,
         usr_email: userEmail || null,
       })
       .select()
       .single();

     return { data, error };
   }
   ```

3. **Supabase Client with Header:**
   ```typescript
   // lib/supabaseClient.ts
   export function getSupabaseClient(): SupabaseClient {
     const { userId } = getUserSession();

     return createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         global: {
           headers: {
             'x-user-id': userId, // RLS policies read this
           },
         },
       }
     );
   }
   ```

4. **User Display:**
   ```typescript
   // components/layout/UserIdentifier.tsx
   // Shows "Operador: [Nome]" or "Operador [UUID slice]"
   ```

#### Important Notes

- **No passwords or traditional auth**
- **Session persists in localStorage** (UUID never changes)
- **Optional name/email** for friendly display
- **RLS policies filter by UUID** via `x-user-id` header
- **Each user sees only their data**

### 2. Calculator-Integrated Inputs (MathInput)

#### Implementation

```typescript
// components/forms/MathInput.tsx
export const MathInput: React.FC<MathInputProps> = ({
  value,
  onChange,
  label,
  ...props
}) => {
  const [preview, setPreview] = useState('');

  // Update preview on value change
  useEffect(() => {
    if (value && /[+\-*/]/.test(value)) {
      const result = evaluateMath(value);
      if (result !== null) {
        setPreview(`= ${formatCurrency(result)}`);
      } else {
        setPreview('');
      }
    } else {
      setPreview('');
    }
  }, [value]);

  // Replace with result on blur
  const handleBlur = () => {
    if (value && /[+\-*/]/.test(value)) {
      const result = evaluateMath(value);
      if (result !== null) {
        onChange({ target: { value: result.toString() } } as any);
      }
    }
    setPreview('');
  };

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={onChange}
        onBlur={handleBlur}
        label={label}
        {...props}
      />
      {preview && (
        <span className="absolute right-3 top-9 text-sm text-green-600 font-medium">
          {preview}
        </span>
      )}
    </div>
  );
};
```

#### Math Parser

```typescript
// lib/mathParser.ts
export function evaluateMath(expression: string): number | null {
  try {
    // Remove non-math characters
    const safe = expression.replace(/[^0-9+\-*/(). ]/g, '');

    // Evaluate using Function (safer than eval)
    const result = new Function(`"use strict"; return (${safe})`)();

    // Validate result
    if (typeof result === 'number' && !isNaN(result)) {
      return Math.round(result * 100) / 100; // Round to 2 decimals
    }

    return null;
  } catch {
    return null;
  }
}
```

#### Usage

```typescript
// In any form with monetary values
<MathInput
  label="Valor"
  value={valor}
  onChange={(e) => setValor(e.target.value)}
  placeholder="Digite o valor ou cálculo (ex: 100+50*2)"
/>
```

**User Experience:**
1. User types: `100+50`
2. Preview shows: `= 150.00`
3. On blur/Enter: Input becomes `150`
4. Value saved to database: `150.00`

### 3. Four-Block Dashboard (Saldo Diário)

#### Location

`app/saldo-diario/page.tsx`

#### Structure

```typescript
// 2x2 grid layout
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Block 1: Pagamentos por Área */}
  <Card title="Pagamentos por Área">
    <List data={pagamentosArea} />
    <Total value={totalPagamentosArea} />
    <Button onClick={() => setModalPagamentoOpen(true)}>
      Adicionar Pagamento
    </Button>
  </Card>

  {/* Block 2: Receitas por Conta */}
  <Card title="Receitas por Conta">
    <List data={receitas} />
    <Total value={totalReceitas} />
    <Button onClick={() => setModalReceitaOpen(true)}>
      Adicionar Receita
    </Button>
  </Card>

  {/* Block 3: Pagamentos por Banco */}
  <Card title="Pagamentos por Banco">
    <List data={pagamentosBanco} />
    <Total value={totalPagamentosBanco} />
    <Button onClick={() => setModalPagamentoBancoOpen(true)}>
      Adicionar Pagamento Banco
    </Button>
  </Card>

  {/* Block 4: Saldo por Banco */}
  <Card title="Saldo por Banco">
    <List data={saldosBanco} />
    <Total value={totalSaldos} />
    <Button onClick={() => setModalSaldoOpen(true)}>
      Atualizar Saldo
    </Button>
  </Card>
</div>
```

#### Date Filter

All blocks filter by selected date (default: today):

```typescript
const [dataSelecionada, setDataSelecionada] = useState(
  new Date().toISOString().split('T')[0]
);

// Load data for selected date
const { data } = await supabase
  .from('pag_pagamentos_area')
  .select('*')
  .eq('pag_data', dataSelecionada);
```

### 4. Excel Import System

#### Historical Data Import

**Location:** `app/admin/importar/page.tsx`

**Process:**
1. User uploads Excel file
2. Frontend parses with `xlsx` library
3. Maps columns to database fields
4. Batch inserts via Supabase

```typescript
import * as XLSX from 'xlsx';

const handleFileUpload = async (file: File) => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);

  // Map and insert
  const records = jsonData.map(row => ({
    // Field mapping
  }));

  const { error } = await supabase
    .from('table')
    .insert(records);
};
```

#### Weekly Forecast Grid Import

**Location:** `app/admin/importar-grid/page.tsx`

**Process:**
1. Uploads Excel with weekly forecast grid
2. Parses rows (areas/accounts) and columns (weeks)
3. Creates `pvs_semanas` records
4. Creates `pvi_previsao_itens` for each cell

### 5. PDF Report Generation

#### Pattern

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const gerarPDF = () => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(16);
  doc.text('Relatório de Saldo Diário', 14, 20);

  // Subtitle
  doc.setFontSize(10);
  doc.text(`Data: ${formatDate(data)}`, 14, 30);

  // Table
  autoTable(doc, {
    head: [['Área', 'Valor', 'Descrição']],
    body: dados.map(row => [
      row.nome,
      formatCurrency(row.valor),
      row.descricao
    ]),
    startY: 35,
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  doc.setFontSize(8);
  doc.text(
    `Página ${pageCount}`,
    doc.internal.pageSize.width / 2,
    doc.internal.pageSize.height - 10,
    { align: 'center' }
  );

  // Save
  doc.save(`relatorio-${data}.pdf`);
};
```

### 6. Smart Area Matching

When importing data with area names, the system suggests matches:

```typescript
// Check if area exists
const { data: existingArea } = await supabase
  .from('are_areas')
  .select('*')
  .eq('are_nome', importedAreaName)
  .single();

if (!existingArea) {
  // Suggest similar areas (fuzzy match)
  const { data: allAreas } = await supabase
    .from('are_areas')
    .select('*');

  const suggestions = allAreas
    .map(area => ({
      ...area,
      similarity: calculateSimilarity(importedAreaName, area.are_nome)
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);

  // Show suggestions to user
}
```

---

## Development Workflows

### Creating a New Migration

#### Step 1: Create Migration File

```bash
# Format: YYYYMMDDHHMMSS_description.sql
# Example: 20251114120000_add_new_feature.sql

cd supabase/migrations
touch 20251114120000_add_new_feature.sql
```

#### Step 2: Write Migration

```sql
-- ============================================================================
-- MIGRATION: Add New Feature Table
-- Data: 2025-11-14
-- Descrição: Creates table for tracking new feature data
-- ============================================================================

-- Create table
CREATE TABLE IF NOT EXISTS financas.nft_new_feature (
  nft_id serial PRIMARY KEY,
  nft_codigo varchar(20) NOT NULL,
  nft_nome varchar(255) NOT NULL,
  nft_ativo boolean DEFAULT true,
  nft_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
  nft_criado_em timestamptz DEFAULT now(),
  nft_atualizado_em timestamptz DEFAULT now(),

  CONSTRAINT uk_nft_codigo_usr UNIQUE(nft_codigo, nft_usr_id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_nft_usr_id
  ON financas.nft_new_feature(nft_usr_id);

-- Create trigger for auto-update timestamp
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_new_feature()
RETURNS TRIGGER AS $$
BEGIN
  NEW.nft_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_timestamp_new_feature
  BEFORE UPDATE ON financas.nft_new_feature
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_new_feature();

-- Enable RLS
ALTER TABLE financas.nft_new_feature ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "nft_usuarios_veem_seus_dados"
  ON financas.nft_new_feature FOR SELECT
  USING (nft_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "nft_usuarios_inserem_seus_dados"
  ON financas.nft_new_feature FOR INSERT
  WITH CHECK (nft_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "nft_usuarios_atualizam_seus_dados"
  ON financas.nft_new_feature FOR UPDATE
  USING (nft_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "nft_usuarios_excluem_seus_dados"
  ON financas.nft_new_feature FOR DELETE
  USING (nft_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- Grant permissions
GRANT ALL ON financas.nft_new_feature TO authenticated;
GRANT ALL ON financas.nft_new_feature TO anon;

-- Comment
COMMENT ON TABLE financas.nft_new_feature IS 'Stores new feature data with user isolation via RLS';
```

#### Step 3: Test Locally (if Supabase CLI available)

```bash
supabase db push
```

#### Step 4: Commit and Push

```bash
git add supabase/migrations/20251114120000_add_new_feature.sql
git commit -m "feat: add new feature table migration"
git push
```

#### Step 5: GitHub Actions Auto-Deploy

The `.github/workflows/supabase.yml` workflow will:
1. Detect changes in `supabase/**`
2. Apply migration to production
3. Generate updated TypeScript types

### Creating a New Page (CRUD Module)

#### Step 1: Create Page Directory

```bash
mkdir -p Front_Web/app/cadastros/new-feature
```

#### Step 2: Create page.tsx

```typescript
// Front_Web/app/cadastros/new-feature/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout';
import { Button, Card, Table, Modal, Loading } from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';

interface NewFeature {
  nft_id: number;
  nft_codigo: string;
  nft_nome: string;
  nft_ativo: boolean;
  nft_criado_em: string;
}

export default function NewFeaturePage() {
  const [features, setFeatures] = useState<NewFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    carregarFeatures();
  }, []);

  const carregarFeatures = async () => {
    try {
      setLoading(true);
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('nft_new_feature')
        .select('*')
        .order('nft_codigo', { ascending: true });

      if (error) throw error;
      setFeatures(data || []);
    } catch (error) {
      console.error('Erro ao carregar features:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir?')) return;

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('nft_new_feature')
        .delete()
        .eq('nft_id', id);

      if (error) throw error;
      await carregarFeatures();
    } catch (error) {
      const mensagem = traduzirErroSupabase(error, 'Erro ao excluir');
      alert(mensagem);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="page-content">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">
            New Features
          </h1>
          <Button onClick={() => setModalOpen(true)}>
            Nova Feature
          </Button>
        </div>

        <Card>
          <Table
            data={features}
            columns={[
              { key: 'nft_codigo', label: 'Código' },
              { key: 'nft_nome', label: 'Nome' },
              {
                key: 'nft_ativo',
                label: 'Status',
                render: (row) => (
                  <span className={row.nft_ativo ? 'text-green-600' : 'text-red-600'}>
                    {row.nft_ativo ? 'Ativo' : 'Inativo'}
                  </span>
                ),
              },
            ]}
            actions={[
              {
                label: 'Editar',
                onClick: (row) => router.push(`/cadastros/new-feature/${row.nft_id}`),
              },
              {
                label: 'Excluir',
                onClick: (row) => handleDelete(row.nft_id),
                variant: 'danger',
              },
            ]}
            emptyMessage="Nenhuma feature cadastrada."
          />
        </Card>

        {modalOpen && (
          <Modal
            title="Nova Feature"
            onClose={() => setModalOpen(false)}
          >
            {/* Form component here */}
          </Modal>
        )}
      </main>
    </div>
  );
}
```

#### Step 3: Update Sidebar Navigation

```typescript
// components/layout/Sidebar.tsx

// Add new menu item
{
  label: 'New Features',
  href: '/cadastros/new-feature',
  icon: IconComponent,
}
```

### Adding a New Component

#### Step 1: Create Component File

```bash
touch Front_Web/components/ui/NewComponent.tsx
```

#### Step 2: Write Component

```typescript
/**
 * NewComponent
 * Description of what this component does
 */

'use client';

import React from 'react';

export interface NewComponentProps {
  prop1: string;
  prop2?: number;
}

export const NewComponent: React.FC<NewComponentProps> = ({
  prop1,
  prop2 = 0,
}) => {
  return (
    <div className="new-component">
      {/* Component JSX */}
    </div>
  );
};

NewComponent.displayName = 'NewComponent';

export default NewComponent;
```

#### Step 3: Add to Barrel Export

```typescript
// components/ui/index.ts
export { NewComponent } from './NewComponent';
export type { NewComponentProps } from './NewComponent';
```

#### Step 4: Use Component

```typescript
import { NewComponent } from '@/components/ui';

<NewComponent prop1="value" />
```

### Deploying Changes

#### Automatic Deployment

**Frontend (Vercel):**
- Push to `main` branch
- Vercel auto-deploys within 2-3 minutes
- Check: https://financeiro-germani.vercel.app

**Database (Supabase):**
- Push changes to `supabase/migrations/`
- GitHub Actions runs on push to `main`
- Migrations applied automatically
- Check Actions tab for status

#### Manual Deployment (if needed)

```bash
# Database only (if Supabase CLI available locally)
supabase db push

# Frontend only
# Trigger re-deploy in Vercel dashboard
# or force push to main
```

---

## Common Tasks

### Task 1: Add a New Master Table

**Example: Adding "Categories" table**

1. **Create migration:**
   ```sql
   -- 20251114120000_create_categories.sql
   CREATE TABLE financas.cat_categorias (
     cat_id serial PRIMARY KEY,
     cat_codigo varchar(20) NOT NULL,
     cat_nome varchar(255) NOT NULL,
     cat_ativo boolean DEFAULT true,
     cat_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
     cat_criado_em timestamptz DEFAULT now(),
     cat_atualizado_em timestamptz DEFAULT now(),
     CONSTRAINT uk_cat_codigo_usr UNIQUE(cat_codigo, cat_usr_id)
   );

   -- Index, trigger, RLS, grants (follow pattern from other tables)
   ```

2. **Create CRUD page:**
   - `app/cadastros/categorias/page.tsx` (list)
   - `app/cadastros/categorias/[id]/page.tsx` (edit)
   - `app/cadastros/categorias/novo/page.tsx` (create)

3. **Create form component:**
   - `components/forms/CategoriaForm.tsx`

4. **Update sidebar menu**

### Task 2: Add a Field to Existing Table

1. **Create migration:**
   ```sql
   ALTER TABLE financas.are_areas
     ADD COLUMN are_observacoes text;

   COMMENT ON COLUMN financas.are_areas.are_observacoes
     IS 'Additional notes about the area';
   ```

2. **Update form component:**
   ```typescript
   const [observacoes, setObservacoes] = useState('');

   <Textarea
     label="Observações"
     value={observacoes}
     onChange={(e) => setObservacoes(e.target.value)}
   />
   ```

3. **Update insert/update queries:**
   ```typescript
   const { error } = await supabase
     .from('are_areas')
     .insert({
       // ... existing fields
       are_observacoes: observacoes,
     });
   ```

### Task 3: Add a New Report

1. **Create report page:**
   ```bash
   mkdir -p Front_Web/app/relatorios/novo-relatorio
   touch Front_Web/app/relatorios/novo-relatorio/page.tsx
   ```

2. **Implement report logic:**
   ```typescript
   'use client';

   import { useState, useEffect } from 'react';
   import jsPDF from 'jspdf';
   import autoTable from 'jspdf-autotable';
   import { Header } from '@/components/layout';
   import { Button, Card } from '@/components/ui';
   import { getSupabaseClient } from '@/lib/supabaseClient';

   export default function NovoRelatorioPage() {
     const [dados, setDados] = useState([]);
     const [dataInicio, setDataInicio] = useState('');
     const [dataFim, setDataFim] = useState('');

     const carregarDados = async () => {
       const supabase = getSupabaseClient();
       const { data } = await supabase
         .from('tabela')
         .select('*')
         .gte('campo_data', dataInicio)
         .lte('campo_data', dataFim);

       setDados(data || []);
     };

     const gerarPDF = () => {
       const doc = new jsPDF();
       // PDF generation logic
       doc.save('relatorio.pdf');
     };

     return (
       <div className="min-h-screen bg-gray-50">
         <Header />
         <main className="page-content">
           <h1>Novo Relatório</h1>

           {/* Filters */}
           <Card>
             <input
               type="date"
               value={dataInicio}
               onChange={(e) => setDataInicio(e.target.value)}
             />
             <input
               type="date"
               value={dataFim}
               onChange={(e) => setDataFim(e.target.value)}
             />
             <Button onClick={carregarDados}>Buscar</Button>
           </Card>

           {/* Results */}
           <Card>
             <Button onClick={gerarPDF}>Gerar PDF</Button>
             {/* Display data */}
           </Card>
         </main>
       </div>
     );
   }
   ```

3. **Add to sidebar menu**

### Task 4: Fix a Bug

1. **Identify the issue:**
   - Check browser console for errors
   - Check Supabase logs for database errors
   - Check Vercel logs for server errors

2. **Locate the code:**
   - If UI issue: check component files
   - If data issue: check database queries
   - If RLS issue: check migration policies

3. **Fix and test locally:**
   ```bash
   cd Front_Web
   npm run dev
   # Test fix at localhost:3000
   ```

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "fix: description of fix"
   git push
   ```

### Task 5: Optimize a Query

**Before:**
```typescript
// Separate queries (N+1 problem)
const { data: receitas } = await supabase
  .from('rec_receitas')
  .select('*');

for (const receita of receitas) {
  const { data: conta } = await supabase
    .from('ctr_contas_receita')
    .select('*')
    .eq('ctr_id', receita.rec_ctr_id)
    .single();

  receita.conta = conta;
}
```

**After:**
```typescript
// Single query with join
const { data: receitas } = await supabase
  .from('rec_receitas')
  .select(`
    *,
    ctr_contas_receita (
      ctr_codigo,
      ctr_nome
    )
  `);
```

---

## Important Gotchas

### 1. Row Level Security

**ALWAYS include `usr_id` in INSERT operations:**

```typescript
// ❌ WRONG - Will fail with RLS policy error
const { error } = await supabase
  .from('are_areas')
  .insert({
    are_codigo: codigo,
    are_nome: nome,
    // Missing are_usr_id!
  });

// ✅ CORRECT
const { userId } = getUserSession();
const { error } = await supabase
  .from('are_areas')
  .insert({
    are_codigo: codigo,
    are_nome: nome,
    are_usr_id: userId, // Required!
  });
```

### 2. Table Naming

**ALWAYS use the `financas` schema:**

```typescript
// ❌ WRONG
.from('areas')

// ✅ CORRECT
.from('are_areas')
```

The table name includes the prefix, and Supabase automatically uses the `financas` schema.

### 3. Unique Constraints

**Most tables have UNIQUE(codigo, usr_id):**

```typescript
// This will fail if user already has an area with code "001"
const { error } = await supabase
  .from('are_areas')
  .insert({
    are_codigo: '001', // Duplicate!
    are_usr_id: userId,
  });

// Error: duplicate key value violates unique constraint "uk_are_codigo_usr"
```

**Handle gracefully:**
```typescript
try {
  const { error } = await supabase.from('are_areas').insert({...});
  if (error) throw error;
} catch (error: any) {
  if (error.code === '23505') {
    alert('Já existe uma área com este código');
  } else {
    alert(traduzirErroSupabase(error, 'Erro ao salvar'));
  }
}
```

### 4. Bank Balance Uniqueness

**Only ONE balance per bank per day:**

```sql
UNIQUE(sdb_ban_id, sdb_data)
```

**When inserting:**
```typescript
// Check if balance exists for this bank/date
const { data: existing } = await supabase
  .from('sdb_saldo_banco')
  .select('*')
  .eq('sdb_ban_id', bancoId)
  .eq('sdb_data', data)
  .single();

if (existing) {
  // Update existing
  await supabase
    .from('sdb_saldo_banco')
    .update({ sdb_valor: novoValor })
    .eq('sdb_id', existing.sdb_id);
} else {
  // Insert new
  await supabase
    .from('sdb_saldo_banco')
    .insert({
      sdb_ban_id: bancoId,
      sdb_data: data,
      sdb_valor: novoValor,
      sdb_usr_id: userId,
    });
}
```

### 5. Client Components Required

**Most pages need 'use client' directive:**

```typescript
// ❌ WRONG - This will break
// app/some-page/page.tsx

import { useState } from 'react'; // Error: useState in Server Component

export default function Page() {
  const [state, setState] = useState(''); // Error!
  return <div>...</div>;
}

// ✅ CORRECT
'use client';

import { useState } from 'react';

export default function Page() {
  const [state, setState] = useState(''); // Works!
  return <div>...</div>;
}
```

### 6. localStorage Only in Client

```typescript
// ❌ WRONG - Will crash during SSR
const userId = localStorage.getItem('userId');

// ✅ CORRECT - Check for window
if (typeof window !== 'undefined') {
  const userId = localStorage.getItem('userId');
}

// ✅ BETTER - Use utility function
import { getUserSession } from '@/lib/userSession';
const { userId } = getUserSession(); // Handles SSR check
```

### 7. Date Format for Database

**ALWAYS use ISO date strings:**

```typescript
// ❌ WRONG
const data = new Date(); // Date object

// ✅ CORRECT
const data = new Date().toISOString().split('T')[0]; // "2025-11-14"

// For queries
.eq('campo_data', '2025-11-14') // String format
```

### 8. Foreign Key Constraints

**Cannot delete referenced records:**

```typescript
// This will fail if there are revenues linked to this account
const { error } = await supabase
  .from('ctr_contas_receita')
  .delete()
  .eq('ctr_id', contaId);

// Error: violates foreign key constraint

// Solution: Delete related records first, or use soft delete (ativo = false)
```

### 9. Math Input Behavior

**MathInput only evaluates on blur:**

```typescript
// User types "100+50"
// onChange receives: "100+50"
// Preview shows: "= 150"
// onBlur triggers evaluation
// onChange receives: "150"

// If you need the value, wait for blur or handle both formats:
const valorFinal = valor.includes('+')
  ? evaluateMath(valor)
  : parseFloat(valor);
```

### 10. Environment Variables

**Prefix matters for Next.js:**

```bash
# ✅ Available in browser
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# ❌ Only available on server
SUPABASE_SECRET_KEY=...

# Access in code
process.env.NEXT_PUBLIC_SUPABASE_URL // Works in client
process.env.SUPABASE_SECRET_KEY // Only works in API routes/server
```

---

## Testing & Debugging

### Health Check

**Check if API is running:**

```bash
curl https://financeiro-germani.vercel.app/api/health
# Response: {"ok":true,"ts":"2025-11-14T12:00:00.000Z"}
```

### Browser Console

**Common debugging patterns:**

```typescript
// Log state changes
useEffect(() => {
  console.log('Areas loaded:', areas);
}, [areas]);

// Log errors with full details
catch (error) {
  console.error('Full error:', error);
  console.error('Error code:', error.code);
  console.error('Error message:', error.message);
}

// Check user session
console.log('Session:', getUserSession());

// Inspect Supabase response
const { data, error } = await supabase.from('table').select('*');
console.log('Data:', data);
console.log('Error:', error);
```

### Network Tab

**Check Supabase requests:**

1. Open DevTools → Network
2. Filter by "supabase"
3. Check request headers for `x-user-id`
4. Check response for data/errors

### Supabase Dashboard

**Check database directly:**

1. Go to Supabase Dashboard
2. SQL Editor
3. Run queries:

```sql
-- Check user data
SELECT * FROM financas.usr_usuarios
WHERE usr_identificador = 'your-uuid';

-- Check RLS is working
SELECT * FROM financas.are_areas LIMIT 10;
-- Should only show current user's data

-- Check policies
SELECT * FROM pg_policies
WHERE schemaname = 'financas';
```

### Common Errors

#### Error: "new row violates row-level security policy"

**Cause:** Missing or incorrect `usr_id`

**Fix:**
```typescript
const { userId } = getUserSession();
// Make sure to include {prefix}_usr_id: userId in INSERT
```

#### Error: "duplicate key value violates unique constraint"

**Cause:** Trying to insert duplicate codigo for same user

**Fix:**
- Check if record exists first
- Update instead of insert
- Or use different codigo

#### Error: "null value in column {prefix}_usr_id violates not-null constraint"

**Cause:** Forgot to include `usr_id` in INSERT

**Fix:**
```typescript
const { userId } = getUserSession();
// Include usr_id in insert data
```

#### Error: "Cannot read properties of undefined"

**Cause:** Data not loaded yet

**Fix:**
```typescript
// Add loading state
if (loading) return <Loading />;

// Or use optional chaining
data?.map(...)
```

#### Error: "localStorage is not defined"

**Cause:** Trying to access localStorage during SSR

**Fix:**
```typescript
// Use getUserSession utility
const { userId } = getUserSession(); // Handles SSR

// Or check for window
if (typeof window !== 'undefined') {
  localStorage.getItem('key');
}
```

---

## Summary Checklist

When working on this codebase, always remember:

### Database
- [ ] Use `financas` schema
- [ ] Follow three-letter prefix naming
- [ ] Include audit fields (`usr_id`, `criado_em`, `atualizado_em`)
- [ ] Create auto-update trigger for timestamps
- [ ] Enable RLS with proper policies
- [ ] Add grants for `authenticated` and `anon`
- [ ] Use `CHECK` constraints for monetary values

### Code
- [ ] Add `'use client'` directive for interactive components
- [ ] Import from `@/components/*` using barrel exports
- [ ] Use `getUserSession()` to get current user
- [ ] Use `getSupabaseClient()` for database access
- [ ] Include `usr_id` in all INSERT operations
- [ ] Handle loading states with `Loading` component
- [ ] Handle errors with `traduzirErroSupabase()`
- [ ] Use `MathInput` for monetary fields
- [ ] Follow import organization pattern

### Styling
- [ ] Use Tailwind utility classes
- [ ] Use brand colors (red primary, white secondary)
- [ ] Follow responsive design (mobile-first)
- [ ] Use consistent spacing/padding

### Git
- [ ] Commit messages: `feat:`, `fix:`, `docs:`, `refactor:`
- [ ] Test locally before pushing
- [ ] Push to appropriate branch
- [ ] Migrations trigger auto-deploy

---

## Additional Resources

### Documentation Files

- **docs/ARQUITETURA.md** - System architecture details
- **docs/BANCO_DE_DADOS.md** - Database schema documentation
- **docs/FRONTEND.md** - Frontend structure and patterns
- **docs/SETUP.md** - Local setup instructions

### External Links

- **Production:** https://financeiro-germani.vercel.app
- **Supabase Dashboard:** [Configured in environment]
- **Vercel Dashboard:** [Check deployments]
- **Repository:** https://github.com/EquipeGF2/Financeiro

---

**Last Updated:** 2025-11-14
**Maintained By:** EquipeGF2
**For AI Assistants:** This document should be updated whenever significant changes are made to patterns or conventions.
