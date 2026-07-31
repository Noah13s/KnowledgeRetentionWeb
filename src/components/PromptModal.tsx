import { useEffect, useRef } from 'react';

interface PromptModalProps {
  open: boolean;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string | null) => void; // null for cancel
}

export default function PromptModal({ open, message, defaultValue = '', placeholder, onConfirm }: PromptModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      // focus and select the input so the default value is visible and editable
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 9999,
    }}>
      <div style={{ width: '90%', maxWidth: 480, background: '#222', color: 'white', padding: 16, borderRadius: 8, boxSizing: 'border-box' }}>
        <div style={{ marginBottom: 8 }}>{message}</div>
        <input
          ref={inputRef}
          defaultValue={defaultValue}
          placeholder={placeholder}
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', marginBottom: 12 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onConfirm((e.target as HTMLInputElement).value);
            } else if (e.key === 'Escape') {
              onConfirm(null);
            }
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => onConfirm(null)} style={{ padding: '8px 12px' }}>Cancel</button>
          <button onClick={() => onConfirm(inputRef.current ? inputRef.current.value : '')} style={{ padding: '8px 12px' }}>OK</button>
        </div>
      </div>
    </div>
  );
}
