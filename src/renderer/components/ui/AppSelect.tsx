import { useEffect, useId, useRef, useState } from 'react';
import './AppSelect.css';

export interface AppSelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface AppSelectProps {
  id?: string;
  value: string | number;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export function AppSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Выберите…',
  className = '',
  'aria-label': ariaLabel,
}: AppSelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = options.find((opt) => String(opt.value) === String(value));

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`app-select${open ? ' app-select--open' : ''}${disabled ? ' app-select--disabled' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        id={selectId}
        className="app-select__trigger form-field__select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
      >
        <span className="app-select__value">{selected?.label ?? placeholder}</span>
        <span className="app-select__chevron" aria-hidden />
      </button>

      {open && (
        <ul className="app-select__menu" role="listbox" aria-labelledby={selectId}>
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <li key={String(option.value)} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`app-select__option${isSelected ? ' app-select__option--selected' : ''}`}
                  disabled={option.disabled}
                  onClick={() => !option.disabled && pick(String(option.value))}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
