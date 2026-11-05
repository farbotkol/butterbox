"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type PasswordInputProps = {
  autoComplete: "current-password" | "new-password";
  id: string;
  minLength?: number;
  name: string;
  placeholder?: string;
  required?: boolean;
};

export function PasswordInput({
  autoComplete,
  id,
  minLength,
  name,
  placeholder,
  required = true,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative mt-2 block">
      <input
        autoComplete={autoComplete}
        className="block min-h-12 w-full rounded-lg border border-line bg-white px-4 py-3 pr-12 text-base text-ink outline-none transition placeholder:text-muted/55 focus:border-ocean focus:ring-4 focus:ring-ocean/10 disabled:cursor-not-allowed disabled:bg-cloud"
        id={id}
        minLength={minLength}
        name={name}
        placeholder={placeholder}
        required={required}
        type={visible ? "text" : "password"}
      />
      <button
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 inline-flex min-h-12 min-w-12 items-center justify-center rounded-r-lg text-muted hover:text-ocean focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ocean"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  );
}