import { useState, useRef } from 'react';
import { DownloadIcon, UploadIcon, AlertCircleIcon, CheckCircle2Icon, Loader2Icon, KeyRoundIcon, InfoIcon } from 'lucide-react';
import { exportData, importData, inspectBackup } from '../../utils/backup.ts';
import type { BackupInspection } from '../../utils/backup.types.ts';
import { useStore } from '../../store/index.ts';

export function DataSettings() {
    const store = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [exportPassword, setExportPassword] = useState('');
    const [includeApiKeys, setIncludeApiKeys] = useState(false);
    const [importPassword, setImportPassword] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [backupInfo, setBackupInfo] = useState<BackupInspection | null>(null);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'loading' | 'info' | null; message: string }>({
        type: null,
        message: ''
    });

    const handleExport = async () => {
        try {
            // Validation: API keys require password
            if (includeApiKeys && !exportPassword.trim()) {
                setStatus({ type: 'error', message: 'Password is required when including API keys.' });
                return;
            }

            setStatus({ type: 'loading', message: 'Exporting data...' });
            await exportData({
                password: exportPassword || undefined,
                includeApiKeys
            });

            const suffix = includeApiKeys ? ' (with API keys)' : '';
            setStatus({ type: 'success', message: `Data exported successfully${suffix}!` });
            setExportPassword('');
            setIncludeApiKeys(false);
            setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Failed to export data.';
            setStatus({ type: 'error', message });
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

        // Inspect backup first to check if it has API keys
        try {
            const info = await inspectBackup(file);
            setBackupInfo(info);
            setSelectedFile(file);

            if (info.hasApiKeys) {
                setStatus({
                    type: 'info',
                    message: 'This backup contains API keys. Please enter the password and click Import.'
                });
            } else if (info.encrypted) {
                setStatus({
                    type: 'info',
                    message: 'This backup is encrypted. Please enter the password and click Import.'
                });
            } else {
                // Auto-proceed if no encryption and no API keys
                await performImport(file);
            }
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Failed to read backup file.';
            setStatus({ type: 'error', message });
        }
    };

    const performImport = async (file: File) => {
        try {
            setStatus({ type: 'loading', message: 'Importing data...' });
            await importData(file, { password: importPassword || undefined });

            const hasKeys = backupInfo?.hasApiKeys;
            const successMessage = hasKeys
                ? 'Data imported successfully! API keys have been re-encrypted for this device. Reloading...'
                : 'Data imported successfully! Reloading...';

            setStatus({ type: 'success', message: successMessage });
            setImportPassword('');
            setBackupInfo(null);
            setSelectedFile(null);

            // Reload store data
            await store.loadFromStorage();

            setTimeout(() => {
                setStatus({ type: null, message: '' });
                window.location.reload();
            }, 1500);

        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Failed to import data. Please check the file format.';
            setStatus({ type: 'error', message });
        }
    };

    const handleImportConfirm = async () => {
        if (!selectedFile) return;
        await performImport(selectedFile);
    };

    // Determine if we need to show confirm button
    const needsConfirmation = backupInfo && (backupInfo.hasApiKeys || backupInfo.encrypted);
    const canImport = !needsConfirmation ||
        (backupInfo?.hasApiKeys && importPassword.trim()) ||
        (backupInfo?.encrypted && !backupInfo.hasApiKeys && importPassword.trim());

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

                    {/* Include API Keys Toggle */}
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeApiKeys}
                                onChange={(e) => setIncludeApiKeys(e.target.checked)}
                                disabled={status.type === 'loading'}
                                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                            />
                            <div className="flex-1">
                                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                    <KeyRoundIcon size={12} />
                                    Include API Keys
                                </span>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {includeApiKeys
                                        ? 'API keys will be encrypted with your password and can be restored on another device.'
                                        : 'API keys will not be included. You will need to re-enter them after restore.'
                                    }
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Password Field */}
                    <div className="mb-3">
                        <label className="text-xs block mb-2 font-medium text-foreground">
                            Encryption Password {includeApiKeys && <span className="text-red-500">*</span>}
                        </label>
                        <input
                            type="password"
                            value={exportPassword}
                            onChange={(e) => setExportPassword(e.target.value)}
                            placeholder={
                                includeApiKeys
                                    ? 'Required: Enter password to encrypt API keys'
                                    : 'Optional: Enter password to encrypt backup'
                            }
                            disabled={status.type === 'loading'}
                            className={`w-full bg-background border rounded-md px-3 py-2 text-xs text-foreground
                                focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50
                                transition-shadow disabled:opacity-50
                                ${includeApiKeys && !exportPassword ? 'border-amber-500/50' : 'border-border'}`}
                        />
                        {exportPassword && (
                            <p className="text-xs text-amber-500/90 leading-tight pt-0.5">
                                Do not lose this password! You will need it to restore this backup.
                            </p>
                        )}
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={status.type === 'loading' || (includeApiKeys && !exportPassword.trim())}
                        className="w-full flex items-center justify-between p-3 mt-1 rounded-lg border border-border
                            bg-background hover:bg-accent/30 transition-colors group
                            disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                            {includeApiKeys ? 'Export with API Keys' : exportPassword ? 'Export Encrypted Data' : 'Export Data'}
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

                    {/* Backup info display */}
                    {backupInfo && (
                        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                            <div className="flex items-center gap-2 mb-1">
                                <InfoIcon size={14} className="text-blue-500" />
                                <span className="text-xs font-medium text-foreground">Backup Info</span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                                <p>Encrypted: {backupInfo.encrypted ? 'Yes' : 'No'}</p>
                                {backupInfo.hasApiKeys && (
                                    <p className="text-amber-500 flex items-center gap-1">
                                        <KeyRoundIcon size={10} />
                                        Contains API Keys - Password required
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="mb-3">
                        <label className="block mb-2 text-xs font-medium text-foreground">
                            Decryption Password {(backupInfo?.hasApiKeys || backupInfo?.encrypted) && <span className="text-red-500">*</span>}
                        </label>
                        <input
                            type="password"
                            value={importPassword}
                            onChange={(e) => setImportPassword(e.target.value)}
                            placeholder={
                                backupInfo?.hasApiKeys
                                    ? 'Required: Enter password to decrypt API keys'
                                    : 'Enter password if the backup is encrypted'
                            }
                            disabled={status.type === 'loading'}
                            className={`w-full bg-background border rounded-md px-3 py-2 text-xs text-foreground
                                focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50
                                transition-shadow disabled:opacity-50
                                ${backupInfo?.hasApiKeys && !importPassword ? 'border-amber-500/50' : 'border-border'}`}
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

                        {needsConfirmation ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setBackupInfo(null);
                                        setSelectedFile(null);
                                        setStatus({ type: null, message: '' });
                                    }}
                                    disabled={status.type === 'loading'}
                                    className="flex-1 flex items-center justify-center p-3 rounded-lg border border-border
                                        bg-background hover:bg-accent/30 transition-colors"
                                >
                                    <span className="text-xs font-medium text-muted-foreground">Cancel</span>
                                </button>
                                <button
                                    onClick={handleImportConfirm}
                                    disabled={status.type === 'loading' || !canImport}
                                    className="flex-1 flex items-center justify-between p-3 rounded-lg border border-primary/50
                                        bg-primary/10 hover:bg-primary/20 transition-colors group
                                        disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="text-xs font-medium text-primary">
                                        {backupInfo?.hasApiKeys ? 'Import with Keys' : 'Import'}
                                    </span>
                                    <div className="h-7 w-7 rounded-sm bg-primary/20 flex items-center justify-center">
                                        <UploadIcon size={14} className="text-primary" />
                                    </div>
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleImportClick}
                                disabled={status.type === 'loading'}
                                className="w-full flex items-center justify-between p-3 rounded-lg border border-border
                                    bg-background hover:bg-accent/30 transition-colors group"
                            >
                                <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                                    Select file & Import Data
                                </span>
                                <div className="h-7 w-7 rounded-sm bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                    <UploadIcon size={14} className="text-primary" />
                                </div>
                            </button>
                        )}
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
                        status.type === 'info' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                            'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}
                >
                    {status.type === 'success' && <CheckCircle2Icon size={16} className="shrink-0 mt-0.5" />}
                    {status.type === 'error' && <AlertCircleIcon size={16} className="shrink-0 mt-0.5" />}
                    {status.type === 'info' && <InfoIcon size={16} className="shrink-0 mt-0.5" />}
                    {status.type === 'loading' && (
                        <Loader2Icon size={16} className="shrink-0 mt-0.5 animate-spin" />
                    )}
                    <span className="leading-tight">{status.message}</span>
                </div>
            )}
        </section>
    );
}
