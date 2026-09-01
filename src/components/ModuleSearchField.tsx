import { Search } from "lucide-react";
import type { ChangeEventHandler } from "react";

type ModuleSearchFieldProps = {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  className?: string;
  ariaLabel?: string;
};

export default function ModuleSearchField({ value, onChange, placeholder, className = "", ariaLabel }: ModuleSearchFieldProps) {
  return (
    <label className={`flex h-11 items-center gap-3 rounded-2xl border border-gray-200 bg-slate-50 px-4 py-2 ${className}`}>
      <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
      />
    </label>
  );
}
