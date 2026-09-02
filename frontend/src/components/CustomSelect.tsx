"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface SelectOption<T extends string | number = string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface CustomSelectProps<T extends string | number = string | number> {
  value: T | null | undefined;
  onChange: (value: T) => void;
  options: (SelectOption<T> | T)[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  optionClassName?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
}

export default function CustomSelect<T extends string | number = string | number>({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Select...",
  className = "",
  buttonClassName = "",
  dropdownClassName = "",
  optionClassName = "",
  id,
  name,
  "aria-label": ariaLabel,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const selectId = id || `custom-select-${generatedId}`;
  const listboxId = `${selectId}-listbox`;

  // Normalize options into { value, label, disabled } format
  const normalizedOptions: SelectOption<T>[] = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === "object" && opt !== null && "value" in opt) {
        return opt as SelectOption<T>;
      }
      return {
        value: opt as T,
        label: String(opt),
        disabled: false,
      };
    });
  }, [options]);

  const selectedOption = useMemo(() => {
    return normalizedOptions.find((opt) => opt.value === value);
  }, [normalizedOptions, value]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen]);

  // Set initial focused index when opening
  useEffect(() => {
    if (isOpen) {
      const idx = normalizedOptions.findIndex((opt) => opt.value === value && !opt.disabled);
      setFocusedIndex(idx >= 0 ? idx : normalizedOptions.findIndex((opt) => !opt.disabled));
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, normalizedOptions, value]);

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listboxRef.current) {
      const optionEl = listboxRef.current.children[focusedIndex] as HTMLElement;
      if (optionEl) {
        optionEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen, focusedIndex]);

  const handleSelect = (option: SelectOption<T>) => {
    if (option.disabled || disabled) return;
    onChange(option.value);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (e.key === "Tab") {
      setIsOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      let nextIndex = focusedIndex + 1;
      while (nextIndex < normalizedOptions.length && normalizedOptions[nextIndex].disabled) {
        nextIndex++;
      }
      if (nextIndex < normalizedOptions.length) {
        setFocusedIndex(nextIndex);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      let prevIndex = focusedIndex - 1;
      while (prevIndex >= 0 && normalizedOptions[prevIndex].disabled) {
        prevIndex--;
      }
      if (prevIndex >= 0) {
        setFocusedIndex(prevIndex);
      }
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < normalizedOptions.length) {
        const option = normalizedOptions[focusedIndex];
        if (!option.disabled) {
          handleSelect(option);
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left select-none ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden input for form submission compatibility if name is provided */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={value !== null && value !== undefined ? String(value) : ""}
        />
      )}

      {/* Trigger Button */}
      <button
        id={selectId}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        className={`field flex items-center justify-between gap-2 text-left cursor-pointer transition-all ${
          isOpen ? "!border-accent ring-2 ring-accent/20" : ""
        } ${disabled ? "!opacity-50 !cursor-not-allowed" : ""} ${buttonClassName}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 text-foreground/50 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-accent" : ""
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown Options Listbox (Rendered in-DOM so it appears in screen recordings & tab captures) */}
      {isOpen && (
        <ul
          id={listboxId}
          ref={listboxRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={selectId}
          className={`absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-[140px] max-h-56 overflow-y-auto rounded-lg border border-foreground/15 bg-surface p-1 shadow-card-lg animate-rise focus:outline-none ${dropdownClassName}`}
        >
          {normalizedOptions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-foreground/45 italic">No options available</li>
          ) : (
            normalizedOptions.map((opt, index) => {
              const isSelected = opt.value === value;
              const isFocused = index === focusedIndex;
              const isDisabled = Boolean(opt.disabled);

              return (
                <li
                  key={String(opt.value)}
                  id={`${selectId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={isDisabled}
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={() => !isDisabled && setFocusedIndex(index)}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors select-none ${
                    isDisabled
                      ? "opacity-35 cursor-not-allowed bg-transparent text-foreground/40"
                      : isSelected
                      ? "bg-accent/12 text-accent font-bold cursor-pointer"
                      : isFocused
                      ? "bg-foreground/6 text-foreground cursor-pointer"
                      : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                  } ${optionClassName}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <svg
                      className="w-3.5 h-3.5 flex-shrink-0 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
