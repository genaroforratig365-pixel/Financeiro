'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Input, Textarea } from '@/components/ui';

export interface AreaFormValues {
  are_codigo: string;
  are_nome: string;
  are_descricao: string;
  are_ativo: boolean;
}

export interface AreaFormProps {
  initialValues?: Partial<AreaFormValues>;
  onSubmit: (values: AreaFormValues) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
}

type AreaErrors = Partial<Record<keyof AreaFormValues, string>>;

const DEFAULT_VALUES: AreaFormValues = {
  are_codigo: '',
  are_nome: '',
  are_descricao: '',
  are_ativo: true,
};

export const AreaForm: React.FC<AreaFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  loading = false,
  submitLabel = 'Salvar Área',
}) => {
  const [values, setValues] = useState<AreaFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
    are_descricao: initialValues?.are_descricao ?? '',
    are_ativo: initialValues?.are_ativo ?? true,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValues((prev) => ({
      ...prev,
      ...initialValues,
      are_descricao: initialValues?.are_descricao ?? '',
      are_ativo: initialValues?.are_ativo ?? true,
    }));
  }, [initialValues]);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const errors: AreaErrors = useMemo(() => {
    const currentErrors: AreaErrors = {};

    if (!values.are_codigo.trim()) {
      currentErrors.are_codigo = 'Informe o código da área';
    } else if (values.are_codigo.trim().length < 3) {
      currentErrors.are_codigo = 'Use pelo menos 3 caracteres';
    }

    if (!values.are_nome.trim()) {
      currentErrors.are_nome = 'Informe o nome da área';
    }

    if (values.are_descricao && values.are_descricao.length > 300) {
      currentErrors.are_descricao = 'Use no máximo 300 caracteres';
    }

    return currentErrors;
  }, [values]);

  const isValid = useMemo(() => Object.keys(errors).length === 0, [errors]);

  const handleChange = (field: keyof AreaFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (field === 'are_ativo') {
        const checked = (event as React.ChangeEvent<HTMLInputElement>).target.checked;
        setValues((prev) => ({ ...prev, are_ativo: checked }));
        return;
      }

      const textValue = event.target.value;

      setValues((prev) => ({
        ...prev,
        [field]: field === 'are_codigo' ? textValue.toUpperCase() : textValue,
      }));
    };

  const handleBlur = (field: keyof AreaFormValues) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const triggerSubmit = useCallback(async () => {
    setTouched({
      are_codigo: true,
      are_nome: true,
      are_descricao: true,
      are_ativo: true,
    });

    if (!isValid) {
      return;
    }

    await onSubmit({
      ...values,
      are_codigo: values.are_codigo.trim().toUpperCase(),
      are_nome: values.are_nome.trim(),
      are_descricao: values.are_descricao.trim(),
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
          placeholder="Ex: VEN001"
          value={values.are_codigo}
          onChange={handleChange('are_codigo')}
          onBlur={handleBlur('are_codigo')}
          error={touched.are_codigo ? errors.are_codigo : undefined}
          required
          maxLength={20}
        />

        <Input
          label="Nome"
          placeholder="Nome da área"
          value={values.are_nome}
          onChange={handleChange('are_nome')}
          onBlur={handleBlur('are_nome')}
          error={touched.are_nome ? errors.are_nome : undefined}
          required
        />
      </div>

      <Textarea
        label="Descrição"
        placeholder="Descreva o objetivo da área, responsabilidades ou observações relevantes"
        value={values.are_descricao}
        onChange={handleChange('are_descricao')}
        onBlur={handleBlur('are_descricao')}
        error={touched.are_descricao ? errors.are_descricao : undefined}
        rows={4}
        maxLength={300}
        helperText={`${values.are_descricao.length}/300 caracteres`}
      />

      <label className="flex items-center gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={values.are_ativo}
          onChange={handleChange('are_ativo') as (event: React.ChangeEvent<HTMLInputElement>) => void}
          onBlur={handleBlur('are_ativo')}
          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
        />
        Manter área ativa
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

AreaForm.displayName = 'AreaForm';

export default AreaForm;
