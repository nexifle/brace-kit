interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
}

export function Toggle({ checked, onChange, size = 'md' }: ToggleProps) {
  const sizeClass = size === 'sm' ? 'toggle-switch small' : 'toggle-switch';

  return (
    <label className={sizeClass}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-slider"></span>
    </label>
  );
}
