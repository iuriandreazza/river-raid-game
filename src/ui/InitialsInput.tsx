import { INITIALS_LENGTH, sanitizeInitials } from '../../shared/initials.ts';

interface InitialsInputProps {
  value: string;
  onChange: (initials: string) => void;
  disabled?: boolean;
}

/** Arcade-style entry: exactly three letters or digits, always uppercase. */
export function InitialsInput({ value, onChange, disabled }: InitialsInputProps) {
  return (
    <input
      id="initials"
      className="initials"
      value={value}
      onChange={(event) => onChange(sanitizeInitials(event.target.value))}
      maxLength={INITIALS_LENGTH}
      placeholder="AAA"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      autoFocus
      disabled={disabled}
    />
  );
}
