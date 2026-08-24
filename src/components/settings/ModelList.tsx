import { useMemo, useState, type ReactNode } from 'react';
import { PencilIcon, SearchIcon, XIcon } from 'lucide-react';
import { fuzzyFilter } from '../../utils/fuzzySearch.ts';
import fuzzysort from 'fuzzysort';

interface ModelListProps {
  models: string[];
  activeModel: string;
  onSelect: (model: string) => void;
  /** When provided, each row gets a remove (✕) button — used for custom providers. */
  onRemove?: (model: string) => void;
  /** When provided, each row gets an edit button — used for custom providers. */
  onEdit?: (model: string) => void;
  /** Shown when there are no models at all (before any search). */
  emptyText: string;
  /** Max height of the scrollable list area (px). Keeps the card from growing the page. */
  maxHeight?: number;
}

const MARK_CLASS = 'bg-primary/20 text-primary font-semibold rounded-xs px-0.5';

/**
 * Render a model name with fuzzy-matched characters wrapped in <mark>.
 * Uses React nodes (never dangerouslySetInnerHTML) so free-text model names
 * cannot inject markup/scripts.
 */
function highlightModelName(name: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return name;
  const result = fuzzysort.single(q, name);
  if (!result || !result.indexes?.length) return name;

  const indexes = new Set(result.indexes);
  const nodes: ReactNode[] = [];
  let buffer = '';
  let inMark = false;

  for (let i = 0; i < name.length; i++) {
    const matched = indexes.has(i);
    if (matched && !inMark) {
      if (buffer) nodes.push(buffer);
      buffer = '';
      inMark = true;
    } else if (!matched && inMark) {
      nodes.push(
        <mark key={nodes.length} className={MARK_CLASS}>
          {buffer}
        </mark>
      );
      buffer = '';
      inMark = false;
    }
    buffer += name[i];
  }
  if (inMark) {
    nodes.push(
      <mark key={nodes.length} className={MARK_CLASS}>
        {buffer}
      </mark>
    );
  } else if (buffer) {
    nodes.push(buffer);
  }
  return nodes;
}

/**
 * Unified, searchable model list used by both built-in and custom providers so
 * the view stays consistent. The list is bounded (max-height + internal scroll)
 * so it never extends the surrounding settings scroll area.
 */
export function ModelList({
  models,
  activeModel,
  onSelect,
  onRemove,
  onEdit,
  emptyText,
  maxHeight = 240,
}: ModelListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    // fuzzyFilter handles short-query includes fallback and typo-tolerant
    // fuzzysort matching for longer queries.
    const result = fuzzyFilter(models, query);
    // Pin the selected model at the top whenever it matches the current search.
    if (activeModel) {
      const idx = result.indexOf(activeModel);
      if (idx > 0) {
        const arr = result.slice();
        arr.splice(idx, 1);
        arr.unshift(activeModel);
        return arr;
      }
    }
    return result;
  }, [models, query, activeModel]);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Search */}
      <div className="relative">
        <SearchIcon
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models…"
          className="w-full h-8 pl-9 pr-8 text-sm bg-muted/40 border border-input rounded-md outline-none transition-all placeholder:text-muted-foreground/40 text-foreground focus:border-primary/40 focus:ring-1 focus:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
            title="Clear search"
            aria-label="Clear model search"
          >
            <XIcon size={12} />
          </button>
        )}
      </div>

      {/* List — bounded height, scrolls internally */}
      {models.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 py-1">{emptyText}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 py-1">
          No models found for &quot;{query.trim()}&quot;
        </p>
      ) : (
        <div
          className="flex flex-col gap-1 overflow-y-auto border border-border/40 rounded-md p-1"
          style={{ maxHeight }}
          role="listbox"
          aria-label="Models"
        >
          {filtered.map((m) => {
            const active = m === activeModel;
            return (
              <div
                key={m}
                role="option"
                aria-selected={active}
                onClick={() => onSelect(m)}
                className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer transition-all select-none ${
                  active
                    ? 'bg-primary/10 border-primary/30'
                    : 'border-transparent hover:bg-muted/40 hover:border-border/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 shrink-0 rounded-full transition-colors ${
                    active ? 'bg-primary' : 'bg-muted-foreground/25 group-hover:bg-muted-foreground/45'
                  }`}
                />
                <span
                  className={`min-w-0 flex-1 break-all text-sm leading-snug ${
                    active
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground group-hover:text-foreground'
                  }`}
                >
                  {highlightModelName(m, query)}
                </span>
                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit(m); }}
                    className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors p-1"
                    title="Edit model specs"
                    aria-label={`Edit ${m}`}
                  >
                    <PencilIcon size={12} />
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove(m); }}
                    className="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors p-1 -mr-0.5"
                    title="Remove model"
                    aria-label={`Remove ${m}`}
                  >
                    <XIcon size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
