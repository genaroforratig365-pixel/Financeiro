/**
 * Card Component
 * Container com fundo branco, sombra e bordas arredondadas
 */

import React from 'react';

export interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'default' | 'primary' | 'danger' | 'success';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  headerAction,
  footer,
  variant = 'default',
  padding = 'md',
  children,
  className = '',
}) => {
  const baseStyles = `
    bg-white rounded-lg shadow-sm border
    overflow-hidden
  `;

  const variantStyles = {
    default: 'border-gray-200',
    primary: 'border-primary-200 border-l-4 border-l-primary-600',
    danger: 'border-error-200 border-l-4 border-l-error-600',
    success: 'border-success-200 border-l-4 border-l-success-600',
  };

  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const containerClassName = `
    ${baseStyles}
    ${variantStyles[variant]}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  const hasHeader = title || subtitle || headerAction;

  return (
    <div className={containerClassName}>
      {hasHeader && (
        <div className={`border-b border-gray-200 ${paddingStyles[padding]}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {title && (
                <h3 className="text-lg font-semibold text-gray-900">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
              )}
            </div>
            {headerAction && <div className="ml-4">{headerAction}</div>}
          </div>
        </div>
      )}

      <div className={paddingStyles[padding]}>{children}</div>

      {footer && (
        <div
          className={`border-t border-gray-200 bg-gray-50 ${paddingStyles[padding]}`}
        >
          {footer}
        </div>
      )}
    </div>
  );
};

Card.displayName = 'Card';

export default Card;
