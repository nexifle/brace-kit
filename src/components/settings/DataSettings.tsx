import { useState, useRef } from 'react';
import {
    DownloadIcon, UploadIcon, AlertCircleIcon, CheckCircle2Icon,
    Loader2Icon, KeyRoundIcon, InfoIcon, Trash2Icon, LockIcon,
    FileJsonIcon, XIcon, ShieldAlertIcon
} from 'lucide-react';
import { exportData, importData, inspectBackup, resetAllData } from '../../utils/backup.ts';
import type { BackupInspection } from '../../utils/backup.types.ts';
import { useStore } from '../../store/index.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';

type StatusState = { type: 'success' | 'error' | 'loading' | 'info' | null; message: string };
const emptyStatus: StatusState = { type: null, message: '' };

function StatusMessage({ status }: { status: StatusState }) {
    if (!status.type) return null;
    return (
        <div className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-sm animate-in fade-in duration-200
            ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                status.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                    'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}
        >
            {status.type === 'success' && <CheckCircle2Icon size={13} className="shrink-0 mt-0.5" />}
            {status.type === 'error' && <AlertCircleIcon size={13} className="shrink-0 mt-0.5" />}
            {status.type === 'info' && <InfoIcon size={13} className="shrink-0 mt-0.5" />}
            {status.type === 'loading' && <Loader2Icon size={13} className="shrink-0 mt-0.5 animate-spin" />}
            <span className="leading-tight">{status.message}</span>
        </div>
    );
}

export function DataSettings() {
    const store = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [exportPassword, setExportPassword] = useState('');
    const [includeApiKeys, setIncludeApiKeys] = useState(false);
    const [exportStatus, setExportStatus] = useState<StatusState>(emptyStatus);

    const [importPassword, setImportPassword] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [backupInfo, setBackupInfo] = useState<BackupInspection | null>(null);
    const [importStatus, setImportStatus] = useState<StatusState>(emptyStatus);

    const [resetStatus, setResetStatus] = useState<StatusState>(emptyStatus);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // ── Export ──────────────────────────────────────────────────────────────
    const handleExport = async () => {
        try {
            if (includeApiKeys && !exportPassword.trim()) {
                setExportStatus({ type: 'error', message: 'Password is required when including API keys.' });
                return;
            }
            setExportStatus({ type: 'loading', message: 'Exporting data...' });
            await exportData({ password: exportPassword || undefined, includeApiKeys });
            const suffix = includeApiKeys ? ' with API keys' : '';
            setExportStatus({ type: 'success', message: `Exported${suffix} successfully!` });
            setExportPassword('');
            setIncludeApiKeys(false);
            setTimeout(() => setExportStatus(emptyStatus), 3000);
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Failed to export data.';
            setExportStatus({ type: 'error', message });
        }
    };

    // ── Import ──────────────────────────────────────────────────────────────
    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        try {
            const info = await inspectBackup(file);
            setBackupInfo(info);
            setSelectedFile(file);
            if (info.hasApiKeys) {
                setImportStatus({ type: 'info', message: 'Contains API keys — enter password to restore.' });
            } else if (info.encrypted) {
                setImportStatus({ type: 'info', message: 'Encrypted backup — enter password to restore.' });
            } else {
                await performImport(file, info);
            }
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Failed to read backup file.';
            setImportStatus({ type: 'error', message });
        }
    };

    const performImport = async (file: File, info?: BackupInspection) => {
        const hasKeys = (info ?? backupInfo)?.hasApiKeys;
        try {
            setImportStatus({ type: 'loading', message: 'Importing data...' });
            await importData(file, { password: importPassword || undefined });
            setImportStatus({
                type: 'success',
                message: hasKeys
                    ? 'Imported! API keys re-encrypted for this device. Reloading...'
                    : 'Imported successfully! Reloading...'
            });
            setImportPassword('');
            setBackupInfo(null);
            setSelectedFile(null);
            await store.loadFromStorage();
            setTimeout(() => {
                setImportStatus(emptyStatus);
                window.location.reload();
            }, 1500);
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Failed to import. Check file format.';
            setImportStatus({ type: 'error', message });
        }
    };

    const handleImportConfirm = async () => {
        if (!selectedFile) return;
        await performImport(selectedFile);
    };

    const handleCancelImport = () => {
        setBackupInfo(null);
        setSelectedFile(null);
        setImportPassword('');
        setImportStatus(emptyStatus);
    };

    // ── Reset ───────────────────────────────────────────────────────────────
    const handleReset = async () => {
        try {
            setResetStatus({ type: 'loading', message: 'Resetting all data...' });
            await resetAllData();
            setResetStatus({ type: 'success', message: 'Reset complete. Reloading...' });
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Failed to reset data.';
            setResetStatus({ type: 'error', message: `${message} Reloading to recover...` });
        } finally {
            setTimeout(() => window.location.reload(), 1500);
        }
    };

    const needsConfirmation = backupInfo && (backupInfo.hasApiKeys || backupInfo.encrypted);
    const canImport = !needsConfirmation ||
        (backupInfo?.hasApiKeys && importPassword.trim()) ||
        (backupInfo?.encrypted && !backupInfo.hasApiKeys && importPassword.trim());

    const isExporting = exportStatus.type === 'loading';
    const isImporting = importStatus.type === 'loading';
    const isResetting = resetStatus.type === 'loading';

    return (
        <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
            {/* Header */}
            <div className="flex flex-col gap-0.5 px-0.5">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Data Management</h3>
                <p className="text-sm text-muted-foreground leading-none">Backup, restore, and manage your extension data.</p>
            </div>

            <div className="flex flex-col gap-2">

                {/* ── EXPORT ── */}
                <div className={`rounded-lg border overflow-hidden transition-colors duration-200
                    ${includeApiKeys ? 'border-amber-500/30' : 'border-border/60'}`}>
                    <div className={`flex items-center gap-2 px-3 py-2 border-b transition-colors duration-200
                        ${includeApiKeys ? 'bg-amber-500/5 border-amber-500/20' : 'bg-secondary/30 border-border/50'}`}>
                        <DownloadIcon size={12} className="text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold text-foreground flex-1">Export Backup</span>
                        {includeApiKeys && (
                            <span className="text-sm text-amber-500 font-medium animate-in fade-in duration-200">+API keys</span>
                        )}
                    </div>

                    <div className="p-3 flex flex-col gap-2.5">
                        {/* API Keys Toggle */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <KeyRoundIcon size={11} className={`transition-colors duration-200 ${includeApiKeys ? 'text-amber-500' : 'text-muted-foreground'}`} />
                                <span className="text-sm text-foreground">Include API Keys</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={includeApiKeys}
                                    onChange={(e) => setIncludeApiKeys(e.target.checked)}
                                    disabled={isExporting}
                                />
                                <div className="w-8 h-[18px] bg-muted-foreground dark:bg-muted rounded-full peer peer-checked:bg-amber-500/80 transition-all duration-200
                                    after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                                    after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all
                                    peer-checked:after:translate-x-3.5 peer-disabled:opacity-50" />
                            </label>
                        </div>

                        {/* Password Field */}
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                                    Password
                                </label>
                                <span className={`text-sm transition-colors duration-200 ${includeApiKeys ? 'text-amber-500' : 'text-muted-foreground'}`}>
                                    {includeApiKeys ? 'required' : 'optional'}
                                </span>
                            </div>
                            <input
                                type="password"
                                value={exportPassword}
                                onChange={(e) => setExportPassword(e.target.value)}
                                placeholder={includeApiKeys ? 'Encrypt API keys' : 'Encrypt backup (optional)'}
                                disabled={isExporting}
                                className={`w-full h-8 px-2.5 text-sm bg-muted/40 border rounded-md
                                    focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all
                                    placeholder:text-muted-foreground text-foreground disabled:opacity-50
                                    ${includeApiKeys && !exportPassword ? 'border-amber-500/40' : 'border-input'}`}
                            />
                            {exportPassword && (
                                <p className="text-sm text-amber-500/80 leading-tight">
                                    Remember this password — required to restore.
                                </p>
                            )}
                        </div>

                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground leading-tight">
                                App may freeze briefly during export.
                            </p>
                            <button
                                onClick={handleExport}
                                disabled={isExporting || (includeApiKeys && !exportPassword.trim())}
                                className="flex items-center gap-1.5 h-7 px-3 rounded-md border border-border
                                    bg-background hover:bg-accent/40 transition-colors text-sm font-medium text-foreground
                                    disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                            >
                                <DownloadIcon size={11} className="shrink-0" />
                                {includeApiKeys ? 'Export with Keys' : exportPassword ? 'Export Encrypted' : 'Export'}
                            </button>
                        </div>

                        <StatusMessage status={exportStatus} />
                    </div>
                </div>

                {/* ── RESTORE ── */}
                <div className="rounded-lg border border-border/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30 border-b border-border/50">
                        <UploadIcon size={12} className="text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold text-foreground">Restore Backup</span>
                    </div>

                    <div className="p-3 flex flex-col gap-2.5">
                        {/* Backup info badge */}
                        {backupInfo && selectedFile && (
                            <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/20 animate-in fade-in duration-200">
                                <FileJsonIcon size={13} className="text-blue-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground font-medium truncate leading-tight">{selectedFile.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {backupInfo.encrypted && (
                                            <span className="text-sm text-muted-foreground flex items-center gap-0.5">
                                                <LockIcon size={10} />
                                                Encrypted
                                            </span>
                                        )}
                                        {backupInfo.hasApiKeys && (
                                            <span className="text-sm text-amber-500 flex items-center gap-0.5">
                                                <KeyRoundIcon size={10} />
                                                Contains API keys
                                            </span>
                                        )}
                                        {!backupInfo.encrypted && !backupInfo.hasApiKeys && (
                                            <span className="text-sm text-muted-foreground">Plain backup</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={handleCancelImport}
                                    className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
                                    title="Deselect file"
                                >
                                    <XIcon size={12} className="text-muted-foreground" />
                                </button>
                            </div>
                        )}

                        {/* Password (conditional: only when backup needs it) */}
                        {needsConfirmation && (
                            <div className="flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                                        Password
                                    </label>
                                    <span className="text-sm text-red-500">required</span>
                                </div>
                                <input
                                    type="password"
                                    value={importPassword}
                                    onChange={(e) => setImportPassword(e.target.value)}
                                    placeholder={backupInfo?.hasApiKeys ? 'Decrypt API keys' : 'Decrypt backup'}
                                    disabled={isImporting}
                                    onKeyDown={(e) => e.key === 'Enter' && canImport && handleImportConfirm()}
                                    className={`w-full h-8 px-2.5 text-sm bg-muted/40 border rounded-md
                                        focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all
                                        placeholder:text-muted-foreground/40 text-foreground disabled:opacity-50
                                        ${!importPassword ? 'border-amber-500/40' : 'border-input'}`}
                                />
                            </div>
                        )}

                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />

                        {/* Action buttons */}
                        {needsConfirmation ? (
                            <div className="flex gap-1.5">
                                <button
                                    onClick={handleCancelImport}
                                    disabled={isImporting}
                                    className="flex-1 h-8 flex items-center justify-center rounded-md border border-border
                                        bg-background hover:bg-accent/40 transition-colors text-sm font-medium text-muted-foreground
                                        disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleImportConfirm}
                                    disabled={isImporting || !canImport}
                                    className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-md border border-primary/40
                                        bg-primary/10 hover:bg-primary/20 transition-colors text-sm font-medium text-primary
                                        disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                                >
                                    <UploadIcon size={11} className="shrink-0" />
                                    {backupInfo?.hasApiKeys ? 'Restore with Keys' : 'Restore'}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleImportClick}
                                disabled={isImporting}
                                className="w-full h-8 flex items-center justify-center gap-1.5 rounded-md border border-border
                                    bg-background hover:bg-accent/40 transition-colors text-sm font-medium text-foreground
                                    disabled:opacity-50 active:scale-[0.98]"
                            >
                                <UploadIcon size={11} className="shrink-0" />
                                Select & Restore Backup
                            </button>
                        )}

                        <StatusMessage status={importStatus} />

                        <p className="text-sm text-amber-500/70 leading-tight">
                            Restoring will overwrite all current settings and history.
                        </p>
                    </div>
                </div>

                {/* ── DANGER ZONE ── */}
                <div className="rounded-lg border border-destructive/50 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-destructive/15 border-b border-destructive/40">
                        <ShieldAlertIcon size={12} className="text-destructive shrink-0" />
                        <span className="text-sm font-semibold text-destructive">Danger Zone</span>
                    </div>
                    <div className="p-3 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm text-muted-foreground leading-tight flex-1">
                                Permanently delete all conversations, providers, memory, and settings.
                            </p>
                            <button
                                onClick={() => setShowResetConfirm(true)}
                                disabled={isResetting}
                                className="flex items-center gap-1.5 h-7 px-3 rounded-md border border-destructive/60 shrink-0
                                    bg-destructive/10 hover:bg-destructive/20 transition-colors text-sm font-medium text-destructive
                                    disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                            >
                                <Trash2Icon size={11} className="shrink-0" />
                                Reset All
                            </button>
                        </div>

                        <StatusMessage status={resetStatus} />
                    </div>
                </div>
            </div>

            <ConfirmDialog
                isOpen={showResetConfirm}
                title="Reset All Data?"
                message="This will permanently delete all conversations, AI providers, memory, MCP servers, and settings. The extension will return to its factory default state. This cannot be undone."
                confirmLabel="Reset All Data"
                cancelLabel="Cancel"
                variant="danger"
                onConfirm={() => {
                    setShowResetConfirm(false);
                    handleReset();
                }}
                onCancel={() => setShowResetConfirm(false)}
            />
        </section>
    );
}
