/**
 * MathInput Component
 * Input com calculadora integrada
 * Aceita expressões matemáticas: +, -, *, /, parênteses
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { evaluateMath, formatNumber } from '@/lib/mathParser';

export interface MathInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onCalculate?: (result: number) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  allowNegative?: boolean;
  maxDecimals?: number;
}

export const MathInput: React.FC<MathInputProps> = ({
  label,
  value,
  onChange,
  onCalculate,
  placeholder = 'Ex: 100+50 ou 200*2',
  required = false,
  disabled = false,
  error,
  helperText,
  allowNegative = false,
  maxDecimals = 2,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [preview, setPreview] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Se estiver vazio, limpa o preview
    if (!newValue.trim()) {
      setPreview(null);
      setIsValid(true);
      onChange('');
      return;
    }

    // Tenta avaliar a expressão
    const result = evaluateMath(newValue);

    if (result !== null) {
      // Valida se número negativo é permitido
      if (!allowNegative && result < 0) {
        setIsValid(false);
        setPreview('Valor não pode ser negativo');
      } else {
        setIsValid(true);
        setPreview(`= ${formatNumber(result)}`);
      }
    } else {
      // Se não for uma expressão válida, verifica se é apenas um número
      const directNumber = parseFloat(newValue);
      if (!isNaN(directNumber)) {
        setIsValid(true);
        setPreview(null);
      } else {
        setIsValid(false);
        setPreview('Expressão inválida');
      }
    }
  };

  const handleBlur = () => {
    if (!inputValue.trim()) {
      onChange('');
      return;
    }

    const result = evaluateMath(inputValue);

    if (result !== null) {
      // Valida se número negativo é permitido
      if (!allowNegative && result < 0) {
        setIsValid(false);
        return;
      }

      // Arredonda conforme maxDecimals
      const rounded = Number(result.toFixed(maxDecimals));

      // Atualiza o valor com o resultado calculado
      const resultString = rounded.toString();
      setInputValue(resultString);
      onChange(resultString);
      setPreview(null);

      // Chama callback se fornecido
      onCalculate?.(rounded);
    } else {
      // Se não for uma expressão válida, tenta converter para número
      const directNumber = parseFloat(inputValue);
      if (!isNaN(directNumber)) {
        const rounded = Number(directNumber.toFixed(maxDecimals));
        const resultString = rounded.toString();
        setInputValue(resultString);
        onChange(resultString);
        onCalculate?.(rounded);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ao pressionar Enter, calcula o resultado
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
    }
  };

  const calculatorIcon = (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );

  const finalHelperText = preview
    ? `${preview}${helperText ? ` • ${helperText}` : ''}`
    : helperText;

  return (
    <div className="relative">
      <Input
        label={label}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        error={error || (!isValid ? 'Expressão inválida' : undefined)}
        helperText={finalHelperText}
        leftIcon={calculatorIcon}
        fullWidth
      />

      {preview && isValid && (
        <div className="absolute right-3 top-9 text-sm font-medium text-primary-600 pointer-events-none">
          {preview}
        </div>
      )}
    </div>
  );
};

MathInput.displayName = 'MathInput';

export default MathInput;
