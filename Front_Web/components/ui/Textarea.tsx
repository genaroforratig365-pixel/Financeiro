/**
 * Textarea Component
 * Campo multilinha com label e mensagens de erro
 */

import React, { forwardRef } from 'react';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { label, error, helperText, fullWidth = false, className = '', id, ...props },
    ref,
  ) => {
    const textareaId = id || `textarea-${Math.random().toString(36).slice(2, 10)}`;
    const hasError = Boolean(error);

    const containerClassName = fullWidth ? 'w-full' : '';
    const textareaClassName = `
      block w-full px-3 py-2
      border rounded-md
      text-gray-900 placeholder-gray-400
      transition-colors duration-200
      focus:outline-none focus:ring-2 focus:ring-offset-0
      disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
      ${hasError
        ? 'border-error-500 focus:border-error-500 focus:ring-error-500'
        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'}
      ${className}
    `.replace(/\s+/g, ' ').trim();

    return (
      <div className={containerClassName}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
            {props.required && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}

        <textarea ref={ref} id={textareaId} className={textareaClassName} {...props} />

        {error && (
          <p className="mt-1 text-sm text-error-600 flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}

        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export default Textarea;
