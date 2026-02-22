import { useState, useRef } from 'react';
import { DownloadIcon, UploadIcon, AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from 'lucide-react';
import { exportData, importData } from '../../utils/backup.ts';
import { useStore } from '../../store/index.ts';

export function DataSettings() {
    const store = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [exportPassword, setExportPassword] = useState('');
    const [importPassword, setImportPassword] = useState('');
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'loading' | null; message: string }>({
        type: null,
        message: ''
    });

    const handleExport = async () => {
        try {
            setStatus({ type: 'loading', message: 'Exporting data...' });
            await exportData(exportPassword);
            setStatus({ type: 'success', message: 'Data exported successfully!' });
            setExportPassword('');
            setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        } catch (err) {
            console.error(err);
            setStatus({ type: 'error', message: 'Failed to export data.' });
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset file input so same file can be selected again
        e.target.value = '';

        try {
            setStatus({ type: 'loading', message: 'Importing data...' });
            await importData(file, importPassword);
            setStatus({ type: 'success', message: 'Data imported successfully! Reloading...' });
            setImportPassword('');

            // Reload store data
            await store.loadFromStorage();

            setTimeout(() => {
                setStatus({ type: null, message: '' });
                // Optional: reload the page to ensure all state is completely reset
                window.location.reload();
            }, 1500);

        } catch (err) {
            console.error(err);
            setStatus({ type: 'error', message: 'Failed to import data. Please check the file format.' });
        }
    };

    return (
        <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
            <div className="flex flex-col gap-0.5 px-0.5">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Data Management</h3>
                <p className="text-xs text-muted-foreground leading-none">
                    Backup or restore your settings, conversations, and custom configurations.
                </p>
            </div>

            <div className="flex flex-col gap-6 mt-2">
                {/* --- EXPORT SECTION --- */}
                <div className="space-y-3 p-4 rounded-xl border border-border/40 bg-card/60">
                    <div>
                        <h4 className="text-sm font-medium text-foreground mb-1">Export Backup</h4>
                        <p className="text-xs text-muted-foreground mb-3">
                            Download a backup of your settings, conversations, and custom configurations.
                            <br />
                            <span className="text-xs text-amber-500/80 mt-1 inline-block">
                                Note: This process may cause the app to freeze momentarily. Please wait until finished.
                            </span>
                        </p>
                    </div>

                    <div className="mb-3">
                        <label className="text-xs block mb-2 font-medium text-foreground">Encryption Password (Optional)</label>
                        <input
                            type="password"
                            value={exportPassword}
                            onChange={(e) => setExportPassword(e.target.value)}
                            placeholder="Enter a password to encrypt your backup"
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 transition-shadow"
                        />
                        {exportPassword && (
                            <p className="text-xs text-amber-500/90 leading-tight pt-0.5">
                                Do not lose this password! You will need it to restore this backup.
                            </p>
                        )}
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={status.type === 'loading'}
                        className="w-full flex items-center justify-between p-3 mt-1 rounded-lg border border-border bg-background hover:bg-accent/30 transition-colors group"
                    >
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                            {exportPassword ? 'Export Encrypted Data' : 'Export Data'}
                        </span>
                        <div className="h-7 w-7 rounded-sm bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <DownloadIcon size={14} className="text-primary" />
                        </div>
                    </button>
                </div>

                {/* --- IMPORT SECTION --- */}
                <div className="space-y-3 p-4 rounded-xl border border-border/40 bg-card/60">
                    <div>
                        <h4 className="text-sm font-medium text-foreground mb-1">Restore Backup</h4>
                        <p className="text-xs text-muted-foreground mb-3">
                            Restore your data from a previously downloaded backup file.
                            <br />
                            <span className="text-xs text-amber-500/80 mt-1 inline-block">
                                Note: This process may cause the app to freeze momentarily. Please wait until finished.
                            </span>
                        </p>
                    </div>

                    <div className="mb-3">
                        <label className="block mb-2 text-xs font-medium text-foreground">Decryption Password (If applicable)</label>
                        <input
                            type="password"
                            value={importPassword}
                            onChange={(e) => setImportPassword(e.target.value)}
                            placeholder="Enter password if the backup is encrypted"
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 transition-shadow"
                        />
                    </div>

                    <div className="relative pt-1">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".json"
                            className="hidden"
                        />
                        <button
                            onClick={handleImportClick}
                            disabled={status.type === 'loading'}
                            className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-accent/30 transition-colors group"
                        >
                            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                                Select file & Import Data
                            </span>
                            <div className="h-7 w-7 rounded-sm bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                <UploadIcon size={14} className="text-primary" />
                            </div>
                        </button>
                        <p className="mt-2.5 text-xs text-amber-500/90">
                            Warning: Importing will completely overwrite your current settings and history.
                        </p>
                    </div>
                </div>
            </div>

            {/* Status Messages */}
            {status.type && (
                <div className={`mt-4 p-3 rounded-md flex items-start gap-2 text-xs animate-in fade-in slide-in-from-top-1
            ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                        status.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                            'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}
                >
                    {status.type === 'success' && <CheckCircle2Icon size={16} className="shrink-0 mt-0.5" />}
                    {status.type === 'error' && <AlertCircleIcon size={16} className="shrink-0 mt-0.5" />}
                    {status.type === 'loading' && (
                        <Loader2Icon size={16} className="shrink-0 mt-0.5 animate-spin" />
                    )}
                    <span className="leading-tight">{status.message}</span>
                </div>
            )}
        </section>
    );
}
