'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Input } from '@/components/ui';

export interface BancoFormValues {
  ban_codigo: string;
  ban_nome: string;
  ban_numero_conta: string;
  ban_agencia: string;
  ban_tipo_conta: string;
  ban_saldo_inicial: string;
  ban_ativo: boolean;
}

export interface BancoFormProps {
  initialValues?: Partial<BancoFormValues>;
  onSubmit: (values: BancoFormValues) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
}

type BancoErrors = Partial<Record<keyof BancoFormValues, string>>;

const DEFAULT_VALUES: BancoFormValues = {
  ban_codigo: '',
  ban_nome: '',
  ban_numero_conta: '',
  ban_agencia: '',
  ban_tipo_conta: 'Corrente',
  ban_saldo_inicial: '0',
  ban_ativo: true,
};

export const BancoForm: React.FC<BancoFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  loading = false,
  submitLabel = 'Salvar Banco',
}) => {
  const [values, setValues] = useState<BancoFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
    ban_agencia: initialValues?.ban_agencia ?? '',
    ban_tipo_conta: initialValues?.ban_tipo_conta ?? 'Corrente',
    ban_numero_conta: initialValues?.ban_numero_conta ?? '',
    ban_saldo_inicial:
      initialValues?.ban_saldo_inicial !== undefined
        ? String(initialValues.ban_saldo_inicial)
        : '0',
    ban_ativo: initialValues?.ban_ativo ?? true,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValues((prev) => ({
      ...prev,
      ...initialValues,
      ban_agencia: initialValues?.ban_agencia ?? '',
      ban_tipo_conta: initialValues?.ban_tipo_conta ?? 'Corrente',
      ban_numero_conta: initialValues?.ban_numero_conta ?? '',
      ban_saldo_inicial:
        initialValues?.ban_saldo_inicial !== undefined
          ? String(initialValues.ban_saldo_inicial)
          : '0',
      ban_ativo: initialValues?.ban_ativo ?? true,
    }));
  }, [initialValues]);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const errors: BancoErrors = useMemo(() => {
    const current: BancoErrors = {};

    if (!values.ban_codigo.trim()) {
      current.ban_codigo = 'Informe o código da conta bancária';
    }

    if (!values.ban_nome.trim()) {
      current.ban_nome = 'Informe o nome do banco ou conta';
    }

    if (!values.ban_numero_conta.trim()) {
      current.ban_numero_conta = 'Informe o número da conta';
    }

    const saldo = Number(values.ban_saldo_inicial.replace(',', '.'));
    if (Number.isNaN(saldo)) {
      current.ban_saldo_inicial = 'Informe um valor numérico válido';
    }

    return current;
  }, [values]);

  const isValid = useMemo(() => Object.keys(errors).length === 0, [errors]);

  const handleChange = (
    field: keyof BancoFormValues,
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (field === 'ban_ativo') {
      const checked = (event as React.ChangeEvent<HTMLInputElement>).target.checked;
      setValues((prev) => ({ ...prev, ban_ativo: checked }));
      return;
    }

    const value = event.target.value;

    setValues((prev) => ({
      ...prev,
      [field]: field === 'ban_codigo' ? value.toUpperCase() : value,
    }));
  };

  const handleBlur = (field: keyof BancoFormValues) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const triggerSubmit = useCallback(async () => {
    setTouched({
      ban_codigo: true,
      ban_nome: true,
      ban_numero_conta: true,
      ban_agencia: true,
      ban_tipo_conta: true,
      ban_saldo_inicial: true,
      ban_ativo: true,
    });

    if (!isValid) {
      return;
    }

    await onSubmit({
      ...values,
      ban_codigo: values.ban_codigo.trim().toUpperCase(),
      ban_nome: values.ban_nome.trim(),
      ban_numero_conta: values.ban_numero_conta.trim(),
      ban_agencia: values.ban_agencia.trim(),
      ban_tipo_conta: values.ban_tipo_conta,
      ban_saldo_inicial: values.ban_saldo_inicial.trim(),
    });
  }, [isValid, onSubmit, values]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await triggerSubmit();
  };

  useEffect(() => {
    const handleHotkeys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        triggerSubmit();
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleHotkeys);
    return () => window.removeEventListener('keydown', handleHotkeys);
  }, [onCancel, triggerSubmit]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          ref={firstFieldRef}
          label="Código"
          placeholder="Ex: BAN001"
          value={values.ban_codigo}
          onChange={handleChange('ban_codigo')}
          onBlur={handleBlur('ban_codigo')}
          error={touched.ban_codigo ? errors.ban_codigo : undefined}
          required
          maxLength={20}
        />

        <Input
          label="Nome da Conta"
          placeholder="Banco XPTO - Conta Principal"
          value={values.ban_nome}
          onChange={handleChange('ban_nome')}
          onBlur={handleBlur('ban_nome')}
          error={touched.ban_nome ? errors.ban_nome : undefined}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Número da Conta"
          placeholder="00012345-6"
          value={values.ban_numero_conta}
          onChange={handleChange('ban_numero_conta')}
          onBlur={handleBlur('ban_numero_conta')}
          error={touched.ban_numero_conta ? errors.ban_numero_conta : undefined}
          required
        />

        <Input
          label="Agência"
          placeholder="1234"
          value={values.ban_agencia}
          onChange={handleChange('ban_agencia')}
          onBlur={handleBlur('ban_agencia')}
          error={touched.ban_agencia ? errors.ban_agencia : undefined}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo de Conta
          </label>
          <select
            className="block w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={values.ban_tipo_conta}
            onChange={handleChange('ban_tipo_conta')}
            onBlur={handleBlur('ban_tipo_conta')}
          >
            <option value="Corrente">Corrente</option>
            <option value="Poupança">Poupança</option>
            <option value="Investimento">Investimento</option>
            <option value="Aplicação">Aplicação</option>
            <option value="Digital">Digital</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Saldo Inicial"
          type="number"
          step="0.01"
          min="0"
          value={values.ban_saldo_inicial}
          onChange={handleChange('ban_saldo_inicial')}
          onBlur={handleBlur('ban_saldo_inicial')}
          error={touched.ban_saldo_inicial ? errors.ban_saldo_inicial : undefined}
          helperText="Utilize este valor para conciliação inicial"
        />
      </div>

      <label className="flex items-center gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={values.ban_ativo}
          onChange={handleChange('ban_ativo') as (event: React.ChangeEvent<HTMLInputElement>) => void}
          onBlur={handleBlur('ban_ativo')}
          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
        />
        Manter conta ativa
      </label>

      <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4 border-t border-gray-200">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={loading} disabled={loading || !isValid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

BancoForm.displayName = 'BancoForm';

export default BancoForm;
