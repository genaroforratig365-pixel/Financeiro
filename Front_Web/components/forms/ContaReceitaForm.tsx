'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Input, Textarea } from '@/components/ui';

export interface ContaReceitaFormValues {
  ctr_codigo: string;
  ctr_nome: string;
  ctr_descricao: string;
  ctr_ativo: boolean;
}

export interface ContaReceitaFormProps {
  initialValues?: Partial<ContaReceitaFormValues>;
  onSubmit: (values: ContaReceitaFormValues) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
}

type ContaErrors = Partial<Record<keyof ContaReceitaFormValues, string>>;

const DEFAULT_VALUES: ContaReceitaFormValues = {
  ctr_codigo: '',
  ctr_nome: '',
  ctr_descricao: '',
  ctr_ativo: true,
};

export const ContaReceitaForm: React.FC<ContaReceitaFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  loading = false,
  submitLabel = 'Salvar Conta',
}) => {
  const [values, setValues] = useState<ContaReceitaFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
    ctr_descricao: initialValues?.ctr_descricao ?? '',
    ctr_ativo: initialValues?.ctr_ativo ?? true,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValues((prev) => ({
      ...prev,
      ...initialValues,
      ctr_descricao: initialValues?.ctr_descricao ?? '',
      ctr_ativo: initialValues?.ctr_ativo ?? true,
    }));
  }, [initialValues]);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const errors: ContaErrors = useMemo(() => {
    const current: ContaErrors = {};

    if (!values.ctr_codigo.trim()) {
      current.ctr_codigo = 'Informe o código da conta';
    } else if (values.ctr_codigo.trim().length < 3) {
      current.ctr_codigo = 'Use pelo menos 3 caracteres';
    }

    if (!values.ctr_nome.trim()) {
      current.ctr_nome = 'Informe o nome da conta';
    }

    if (values.ctr_descricao && values.ctr_descricao.length > 300) {
      current.ctr_descricao = 'Use no máximo 300 caracteres';
    }

    return current;
  }, [values]);

  const isValid = useMemo(() => Object.keys(errors).length === 0, [errors]);

  const handleChange = (field: keyof ContaReceitaFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (field === 'ctr_ativo') {
        const checked = (event as React.ChangeEvent<HTMLInputElement>).target.checked;
        setValues((prev) => ({ ...prev, ctr_ativo: checked }));
        return;
      }

      const textValue = event.target.value;

      setValues((prev) => ({
        ...prev,
        [field]: field === 'ctr_codigo' ? textValue.toUpperCase() : textValue,
      }));
    };

  const handleBlur = (field: keyof ContaReceitaFormValues) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const triggerSubmit = useCallback(async () => {
    setTouched({
      ctr_codigo: true,
      ctr_nome: true,
      ctr_descricao: true,
      ctr_ativo: true,
    });

    if (!isValid) {
      return;
    }

    await onSubmit({
      ...values,
      ctr_codigo: values.ctr_codigo.trim().toUpperCase(),
      ctr_nome: values.ctr_nome.trim(),
      ctr_descricao: values.ctr_descricao.trim(),
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
          placeholder="Ex: REC001"
          value={values.ctr_codigo}
          onChange={handleChange('ctr_codigo')}
          onBlur={handleBlur('ctr_codigo')}
          error={touched.ctr_codigo ? errors.ctr_codigo : undefined}
          required
          maxLength={20}
        />

        <Input
          label="Nome"
          placeholder="Nome da conta de receita"
          value={values.ctr_nome}
          onChange={handleChange('ctr_nome')}
          onBlur={handleBlur('ctr_nome')}
          error={touched.ctr_nome ? errors.ctr_nome : undefined}
          required
        />
      </div>

      <Textarea
        label="Descrição"
        placeholder="Detalhe a finalidade desta conta de receita"
        value={values.ctr_descricao}
        onChange={handleChange('ctr_descricao')}
        onBlur={handleBlur('ctr_descricao')}
        error={touched.ctr_descricao ? errors.ctr_descricao : undefined}
        rows={4}
        maxLength={300}
        helperText={`${values.ctr_descricao.length}/300 caracteres`}
      />

      <label className="flex items-center gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={values.ctr_ativo}
          onChange={handleChange('ctr_ativo') as (event: React.ChangeEvent<HTMLInputElement>) => void}
          onBlur={handleBlur('ctr_ativo')}
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

ContaReceitaForm.displayName = 'ContaReceitaForm';

export default ContaReceitaForm;
