import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <div className="form-group compact">
        {label && <label className="form-label">{label}</label>}
        <input ref={ref} className={`form-input ${className}`} {...props} />
      </div>
    );
  }
);

Input.displayName = 'Input';
