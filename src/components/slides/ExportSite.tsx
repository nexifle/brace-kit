import { useCallback, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '../ui/index.ts';
import { useSlideStore } from '../../store/slideStore.ts';
import { filesForSiteZip } from '../../utils/siteVfs.ts';
import { buildZip, slugify, type ZipEntry } from '../../utils/zipWriter.ts';
import { isWebBuilderKind, normalizeBuilderKind } from '../../types/slides.ts';

export function ExportSite() {
  const activeProject = useSlideStore((s) => s.activeProject);
  const busy = useSlideStore((s) => s.busy);
  const [exporting, setExporting] = useState(false);
  const { success, error } = useToast();

  const kind = normalizeBuilderKind(activeProject?.kind);
  const files = activeProject?.files ?? [];
  const zipFiles = filesForSiteZip(files);
  const disabled = exporting || busy || !activeProject || !isWebBuilderKind(kind) || zipFiles.length === 0;

  const onExport = useCallback(async () => {
    if (!activeProject || disabled) return;
    setExporting(true);
    try {
      const encoder = new TextEncoder();
      const entries: ZipEntry[] = zipFiles.map((f) => ({
        name: f.path.replace(/^\//, ''),
        data: encoder.encode(f.content),
      }));
      const zip = buildZip(entries);
      const blob = new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugify(activeProject.title) || 'site'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      success(`Exported ${entries.length} file${entries.length === 1 ? '' : 's'}`);
    } catch {
      error('Export failed');
    } finally {
      setExporting(false);
    }
  }, [activeProject, disabled, zipFiles, success, error]);

  return (
    <button
      type="button"
      onClick={() => void onExport()}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
      title={exporting ? 'Exporting…' : 'Export site as HTML zip'}
      aria-label="Export site as HTML zip"
    >
      {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
    </button>
  );
}
