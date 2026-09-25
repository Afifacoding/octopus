import type { InputHTMLAttributes } from 'react';

import { Input } from './Input';

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

export function SearchInput({ placeholder = 'Search...', ...props }: SearchInputProps) {
  return (
    <label className="search" aria-label="Search">
      <span className="muted" aria-hidden="true">
        ⌕
      </span>
      <Input placeholder={placeholder} className="search-input" {...props} />
    </label>
  );
}
