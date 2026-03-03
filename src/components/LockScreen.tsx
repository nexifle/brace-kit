import { useState } from 'react';
import { useStore } from '../store/index.ts';
import { LockIcon, ShieldIcon, ShieldAlertIcon } from 'lucide-react';
import { Btn } from './ui/Btn.tsx';

export function LockScreen() {
  const store = useStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleUnlock = async () => {
    if (!password.trim()) {
      setError('Password required');
      return;
    }

    const isValid = await store.authenticate(password);
    if (!isValid) {
      setError('Access denied: Invalid password');
      setPassword('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  };

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center p-4 overflow-hidden">
      {/* Dynamic Backdrop */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in duration-500"
        onClick={() => { /* Prevents clicks from passing through if needed */ }}
      />

      {/* Dialog Card - Compact Version */}
      <div className="relative w-full max-w-[400px] p-6 rounded-lg bg-card/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-500">

        {/* Lock Icon Section */}
        <div className="relative">
          <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center text-primary animate-pulse border border-primary/20">
            <LockIcon size={24} />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-background border border-border/50 flex items-center justify-center shadow-md">
            <ShieldIcon size={10} className="text-muted-foreground" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <div className="px-2 py-0.5 rounded-full bg-muted/50 border border-border/50 text-2xs font-black uppercase tracking-widest text-muted-foreground">
            Identity Vault
          </div>
          <h2 className="text-lg font-bold text-foreground">Locked</h2>
          <p className="text-xs text-muted-foreground/80 leading-relaxed px-2">
            Enter passphrase to unlock sidebar
          </p>
        </div>

        <div className="w-full space-y-3">
          <div className="space-y-2">
            <input
              type="password"
              className={`w-full bg-muted/20 border rounded-lg px-4 py-2.5 text-sm transition-all outline-none text-center tracking-widest placeholder:tracking-normal placeholder:text-muted-foreground/30
                ${error ? 'border-destructive/50 focus:border-destructive' : 'border-border/50 focus:border-primary focus:ring-4 focus:ring-primary/5'}`}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              placeholder="••••••••"
              autoFocus
            />
            {error && (
              <div className="flex items-center justify-center gap-1 text-2xs font-bold text-destructive animate-in slide-in-from-top-1">
                <ShieldAlertIcon size={10} />
                {error}
              </div>
            )}
          </div>

          <Btn
            variant="default"
            size="sm"
            className="w-full h-11 rounded-lg text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20"
            onClick={handleUnlock}
          >
            Unlock Access
          </Btn>
        </div>

        <div className="text-xs text-muted-foreground/30 font-medium italic">
          Secured by local encryption
        </div>
      </div>
    </div>
  );
}
