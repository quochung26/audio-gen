/** Ô nhập nhiều dòng dùng chung — nhãn, gợi ý, placeholder. */
export function Field({
  name,
  label,
  hint,
  placeholder,
  defaultValue,
  rows = 3,
}: {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-neutral-200">
        {label}
      </label>
      {hint && <p className="mt-0.5 mb-1.5 text-xs text-neutral-500">{hint}</p>}
      <textarea
        id={name}
        name={name}
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-3 text-sm leading-relaxed outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}

export function TextInput({
  name,
  label,
  placeholder,
  defaultValue,
  type = "text",
  ...rest
}: {
  name: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string | number;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs text-neutral-500">{label}</span>}
      <input
        {...rest}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
      />
    </label>
  );
}
