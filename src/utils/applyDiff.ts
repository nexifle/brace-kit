// ==================== V4A-style apply_patch (Codex port) ====================
//
// Faithful TypeScript port of the Codex `apply_patch` implementation so the
// Slide Creator harness can turn structured diffs into file contents without
// shelling out to `patch(1)`.
//
//   https://github.com/openai/codex — codex-rs/apply-patch/src
//
// The patch format is the Lark grammar in `parser.rs`:
//
//   start:       begin_patch environment_id? hunk+ end_patch
//   begin_patch: "*** Begin Patch" LF
//   environment_id: "*** Environment ID: " text LF
//   end_patch:   "*** End Patch" LF?
//   hunk:        add_hunk | delete_hunk | update_hunk
//   add_hunk:    "*** Add File: " path LF ("+" /(.+)/ LF)+   -> contents
//   delete_hunk: "*** Delete File: " path LF
//   update_hunk: "*** Update File: " path LF ("*** Move to: " path LF)? change?
//   change:      (change_context | change_line)+ eof_line?
//   change_context: ("@@" | "@@ " /(.+)/) LF
//   change_line: ("+" | "-" | " ") /(.+)/ LF
//   eof_line:    "*** End of File" LF
//
// Update hunks are applied to an existing file with `seek_sequence` matching
// (exact, then trailing-whitespace tolerant, then trimmed, then Unicode
// punctuation-normalized), mirroring `compute_replacements` / `apply_replacements`
// in `lib.rs`.

// ==================== Patch types ====================

/** One parsed change in the new-file contents produced by an update hunk. */
export interface UpdateFileChunk {
  changeContext: string | null;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
}

/** A parsed top-level operation from a patch. */
export type Hunk =
  | { kind: 'AddFile'; path: string; contents: string }
  | { kind: 'DeleteFile'; path: string }
  | { kind: 'UpdateFile'; path: string; movePath?: string; chunks: UpdateFileChunk[] };

export interface ParsedApplyPatch {
  hunks: Hunk[];
  environmentId?: string;
  patch: string;
}

/** Result of {@link applyDiff}: handed straight to the harness. */
export type ApplyDiffResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

// ==================== Patch markers ====================

export const BEGIN_PATCH_MARKER = '*** Begin Patch';
export const END_PATCH_MARKER = '*** End Patch';
export const ADD_FILE_MARKER = '*** Add File: ';
export const DELETE_FILE_MARKER = '*** Delete File: ';
export const UPDATE_FILE_MARKER = '*** Update File: ';
export const MOVE_TO_MARKER = '*** Move to: ';
export const EOF_MARKER = '*** End of File';
export const CHANGE_CONTEXT_MARKER = '@@ ';
export const EMPTY_CHANGE_CONTEXT_MARKER = '@@';
export const ENVIRONMENT_ID_MARKER = '*** Environment ID:';

// ==================== seek_sequence (fuzzy line matching) ====================

function normalise(s: string): string {
  return s
    .trim()
    .split('')
    .map((c) => {
      switch (c) {
        case '\u2010':
        case '\u2011':
        case '\u2012':
        case '\u2013':
        case '\u2014':
        case '\u2015':
        case '\u2212':
        case '\uFF0D': // fullwidth hyphen-minus — emitted by some models for "—"
        case '\uFE63': // small hyphen-minus
          return '-';
        case '\u2018':
        case '\u2019':
        case '\u201A':
        case '\u201B':
          return "'";
        case '\u201C':
        case '\u201D':
        case '\u201E':
        case '\u201F':
          return '"';
        case '\u00A0':
        case '\u2002':
        case '\u2003':
        case '\u2004':
        case '\u2005':
        case '\u2006':
        case '\u2007':
        case '\u2008':
        case '\u2009':
        case '\u200A':
        case '\u202F':
        case '\u205F':
        case '\u3000':
          return ' ';
        default:
          return c;
      }
    })
    .join('');
}

/**
 * Find the `pattern` lines within `lines` at or after `start`, trying in order:
 * exact, trailing-whitespace tolerant (`trimEnd`), trimmed (`trim`), then
 * Unicode punctuation-normalised + trimmed. When `eof` is set, first try
 * anchoring at the end of the file. Returns the match start index or `null`.
 */
export function seekSequence(
  lines: string[],
  pattern: string[],
  start: number,
  eof: boolean,
): number | null {
  if (pattern.length === 0) return start;
  if (pattern.length > lines.length) return null;
  const searchStart = eof && lines.length >= pattern.length ? lines.length - pattern.length : start;
  const lastStart = lines.length - pattern.length;

  for (let i = searchStart; i <= lastStart; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (lines[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  for (let i = searchStart; i <= lastStart; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (lines[i + j].trimEnd() !== pattern[j].trimEnd()) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  for (let i = searchStart; i <= lastStart; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (lines[i + j].trim() !== pattern[j].trim()) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  for (let i = searchStart; i <= lastStart; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (normalise(lines[i + j]) !== normalise(pattern[j])) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return null;
}

// ==================== Patch → hunks (full parser) ====================

interface ParserState {
  mode:
    | { t: 'NotStarted' }
    | { t: 'StartedPatch' }
    | { t: 'AddFile' }
    | { t: 'DeleteFile' }
    | { t: 'UpdateFile' }
    | { t: 'EndedPatch' };
  hunks: Hunk[];
  environmentId?: string;
}

function isValidHunkHeaderMessage(msg: string): string {
  return `'${msg}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`;
}

/**
 * Parse a full Codex-style patch (`*** Begin Patch ... *** End Patch`) into
 * hunks. Throws `Error` on malformed input, mirroring the Codex parser.
 */
export function parseApplyPatch(patch: string): ParsedApplyPatch {
  const state: ParserState = { mode: { t: 'NotStarted' }, hunks: [] };
  const rawLines = patch.trim().split('\n');

  const ensureUpdateNonEmpty = (): void => {
    const last = state.hunks[state.hunks.length - 1];
    if (last?.kind === 'UpdateFile') {
      if (last.chunks.length === 0 && state.mode.t === 'UpdateFile') {
        throw new Error(`Update file hunk for path '${last.path}' is empty`);
      }
      const c = last.chunks[last.chunks.length - 1];
      if (c && c.oldLines.length === 0 && c.newLines.length === 0) {
        throw new Error('Update hunk does not contain any lines');
      }
    }
  };

  const handleHeader = (top: string): boolean => {
    if (state.mode.t === 'StartedPatch' && top.startsWith(ENVIRONMENT_ID_MARKER)) {
      if (state.environmentId !== undefined) {
        throw new Error('apply_patch environment_id cannot be specified more than once');
      }
      const id = top.slice(ENVIRONMENT_ID_MARKER.length).trim();
      if (id.length === 0) throw new Error('apply_patch environment_id cannot be empty');
      state.environmentId = id;
      return true;
    }
    if (top === END_PATCH_MARKER) {
      ensureUpdateNonEmpty();
      state.mode = { t: 'EndedPatch' };
      return true;
    }
    if (top.startsWith(ADD_FILE_MARKER)) {
      ensureUpdateNonEmpty();
      state.hunks.push({ kind: 'AddFile', path: top.slice(ADD_FILE_MARKER.length), contents: '' });
      state.mode = { t: 'AddFile' };
      return true;
    }
    if (top.startsWith(DELETE_FILE_MARKER)) {
      ensureUpdateNonEmpty();
      state.hunks.push({ kind: 'DeleteFile', path: top.slice(DELETE_FILE_MARKER.length) });
      state.mode = { t: 'DeleteFile' };
      return true;
    }
    if (top.startsWith(UPDATE_FILE_MARKER)) {
      ensureUpdateNonEmpty();
      state.hunks.push({
        kind: 'UpdateFile',
        path: top.slice(UPDATE_FILE_MARKER.length),
        chunks: [],
      });
      state.mode = { t: 'UpdateFile' };
      return true;
    }
    return false;
  };

  for (const rawLine of rawLines) {
    let line = rawLine;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    const trimmed = line.trim();
    const m = state.mode;

    if (m.t === 'NotStarted') {
      if (trimmed === BEGIN_PATCH_MARKER) {
        state.mode = { t: 'StartedPatch' };
        continue;
      }
      throw new Error('The first line of the patch must be \'*** Begin Patch\'');
    }

    if (m.t === 'StartedPatch') {
      if (handleHeader(trimmed)) continue;
      state.mode = { t: 'NotStarted' };
      throw new Error(isValidHunkHeaderMessage(trimmed));
    }

    if (m.t === 'AddFile') {
      if (handleHeader(trimmed)) continue;
      if (line.startsWith('+')) {
        const h = state.hunks[state.hunks.length - 1];
        if (h?.kind === 'AddFile') {
          h.contents += line.slice(1) + '\n';
          continue;
        }
      }
      state.mode = { t: 'NotStarted' };
      throw new Error(isValidHunkHeaderMessage(trimmed));
    }

    if (m.t === 'DeleteFile') {
      if (handleHeader(trimmed)) continue;
      state.mode = { t: 'NotStarted' };
      throw new Error(isValidHunkHeaderMessage(trimmed));
    }

    if (m.t === 'UpdateFile') {
      const update = line.trimEnd();
      const last = state.hunks[state.hunks.length - 1] as
        | (Hunk & { kind: 'UpdateFile' })
        | undefined;
      if (handleHeader(update)) continue;

      const chunks = last ? last.chunks : [];
      if (
        chunks.length > 0 &&
        chunks[chunks.length - 1].isEndOfFile &&
        update !== EMPTY_CHANGE_CONTEXT_MARKER &&
        !update.startsWith(CHANGE_CONTEXT_MARKER)
      ) {
        if (update.length === 0) continue;
        state.mode = { t: 'NotStarted' };
        throw new Error(`Expected update hunk to start with a @@ context marker, got: '${line}'`);
      }

      if (
        chunks.length === 0 &&
        last &&
        last.movePath === undefined &&
        update.startsWith(MOVE_TO_MARKER)
      ) {
        last.movePath = update.slice(MOVE_TO_MARKER.length);
        continue;
      }

      const hasEmptyChunk =
        chunks.length > 0 &&
        chunks[chunks.length - 1].oldLines.length === 0 &&
        chunks[chunks.length - 1].newLines.length === 0;

      if (hasEmptyChunk && (update === EMPTY_CHANGE_CONTEXT_MARKER || update.startsWith(CHANGE_CONTEXT_MARKER))) {
        state.mode = { t: 'NotStarted' };
        throw new Error(
          `Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`,
        );
      }

      const pushChunk = (overrides?: Partial<UpdateFileChunk>): void => {
        chunks.push({
          changeContext: null,
          oldLines: [],
          newLines: [],
          isEndOfFile: false,
          ...overrides,
        });
      };

      if (update === EMPTY_CHANGE_CONTEXT_MARKER) {
        pushChunk();
        continue;
      }
      if (update.startsWith(CHANGE_CONTEXT_MARKER)) {
        pushChunk({ changeContext: update.slice(CHANGE_CONTEXT_MARKER.length) });
        continue;
      }
      if (update === EOF_MARKER) {
        if (chunks.length > 0 && chunks[chunks.length - 1].oldLines.length === 0 && chunks[chunks.length - 1].newLines.length === 0) {
          throw new Error('Update hunk does not contain any lines');
        }
        if (chunks.length > 0) chunks[chunks.length - 1].isEndOfFile = true;
        continue;
      }
      if (line.length === 0) {
        if (chunks.length === 0) pushChunk();
        const c = chunks[chunks.length - 1];
        c.oldLines.push('');
        c.newLines.push('');
        continue;
      }
      if (line.startsWith(' ')) {
        if (chunks.length === 0) pushChunk();
        const c = chunks[chunks.length - 1];
        c.oldLines.push(line.slice(1));
        c.newLines.push(line.slice(1));
        continue;
      }
      if (line.startsWith('+')) {
        if (chunks.length === 0) pushChunk();
        chunks[chunks.length - 1].newLines.push(line.slice(1));
        continue;
      }
      if (line.startsWith('-')) {
        if (chunks.length === 0) pushChunk();
        chunks[chunks.length - 1].oldLines.push(line.slice(1));
        continue;
      }

      const hasContent =
        chunks.length > 0 &&
        (chunks[chunks.length - 1].oldLines.length > 0 ||
          chunks[chunks.length - 1].newLines.length > 0);
      if (hasContent) {
        state.mode = { t: 'NotStarted' };
        throw new Error(`Expected update hunk to start with a @@ context marker, got: '${line}'`);
      }
      state.mode = { t: 'NotStarted' };
      throw new Error(
        `Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`,
      );
    }

    if (m.t === 'EndedPatch') {
      if (trimmed.length === 0) continue;
      throw new Error("The last line of the patch must be '*** End Patch'");
    }
  }

  if (state.mode.t !== 'EndedPatch') {
    throw new Error("The last line of the patch must be '*** End Patch'");
  }

  return { hunks: state.hunks, environmentId: state.environmentId, patch };
}

/**
 * Parse a bare update-chunk body (a sequence of `@@`/`@@ ctx`/`+`/`-`/` `/`*** End of File`
 * lines, without any `*** Update File:` header). Used by {@link applyDiff} so a
 * single-file diff can be applied like the PRD examples.
 */
/** Git unified hunk header, e.g. `@@ -10,3 +10,4 @@` or `@@ -10,3 +10,4 @@ fn`. */
const GIT_HUNK_HEADER = /^@@\s+-\d/;

function isEnvelopeOrGitFileHeader(line: string): boolean {
  const t = line.trim();
  if (t === BEGIN_PATCH_MARKER || t === END_PATCH_MARKER) return true;
  if (t.startsWith(ADD_FILE_MARKER) || t.startsWith(DELETE_FILE_MARKER) || t.startsWith(UPDATE_FILE_MARKER)) {
    return true;
  }
  if (t.startsWith('--- a/') || t.startsWith('+++ b/') || t === '---' || t === '+++') return true;
  if (t.startsWith('diff --git ')) return true;
  return false;
}

export function parseUpdateChunks(diff: string): UpdateFileChunk[] {
  const normalized = diff.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  if (normalized.length === 0) return [];
  const lines = normalized.split('\n');
  const chunks: UpdateFileChunk[] = [];
  for (const rawLine of lines) {
    let line = rawLine;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (isEnvelopeOrGitFileHeader(line)) continue;
    const update = line.trimEnd();
    const last = chunks.length > 0 ? chunks[chunks.length - 1] : undefined;
    const hasEmptyChunk = !!last && last.oldLines.length === 0 && last.newLines.length === 0;

    const isBareOrGitHunk =
      update === EMPTY_CHANGE_CONTEXT_MARKER || GIT_HUNK_HEADER.test(update);

    if (isBareOrGitHunk) {
      if (hasEmptyChunk) {
        throw new Error(
          `Unexpected line found in update hunk: '${line}'. Every line should start with a '@@', ' ', '+', or '-' marker`,
        );
      }
      chunks.push({ changeContext: null, oldLines: [], newLines: [], isEndOfFile: false });
    } else if (update.startsWith(CHANGE_CONTEXT_MARKER)) {
      if (hasEmptyChunk) {
        throw new Error(
          `Unexpected line found in update hunk: '${line}'. Every line should start with a '@@', ' ', '+', or '-' marker`,
        );
      }
      chunks.push({
        changeContext: update.slice(CHANGE_CONTEXT_MARKER.length),
        oldLines: [],
        newLines: [],
        isEndOfFile: false,
      });
    } else if (update === EOF_MARKER) {
      if (!chunks.length) throw new Error('Update hunk does not contain any lines');
      if (chunks[chunks.length - 1].oldLines.length === 0 && chunks[chunks.length - 1].newLines.length === 0) {
        throw new Error('Update hunk does not contain any lines');
      }
      chunks[chunks.length - 1].isEndOfFile = true;
    } else if (line.length === 0) {
      if (!chunks.length) chunks.push({ changeContext: null, oldLines: [], newLines: [], isEndOfFile: false });
      const c = chunks[chunks.length - 1];
      c.oldLines.push('');
      c.newLines.push('');
    } else if (line.startsWith(' ')) {
      if (!chunks.length) chunks.push({ changeContext: null, oldLines: [], newLines: [], isEndOfFile: false });
      const c = chunks[chunks.length - 1];
      c.oldLines.push(line.slice(1));
      c.newLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      if (!chunks.length) chunks.push({ changeContext: null, oldLines: [], newLines: [], isEndOfFile: false });
      chunks[chunks.length - 1].newLines.push(line.slice(1));
    } else if (line.startsWith('-')) {
      if (!chunks.length) chunks.push({ changeContext: null, oldLines: [], newLines: [], isEndOfFile: false });
      chunks[chunks.length - 1].oldLines.push(line.slice(1));
    } else if (line.length > 0) {
      throw new Error(`Unexpected line in diff: '${line}'. Every line should start with '@@', ' ', '+', or '-'`);
    }
  }
  return chunks.filter((c) => c.oldLines.length > 0 || c.newLines.length > 0 || c.isEndOfFile);
}

// ==================== Apply chunks to a file (Codex lib.rs) ====================

function splitFileLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

interface Replacement {
  start: number;
  oldLen: number;
  newLines: string[];
  /**
   * In-line substring replacement for a single-line file: replace the
   * (normalized-matched) substring `old` within `lines[start]` with `next`.
   * Set when whole-line matching fails but the pattern is a substring of a
   * file line (models often match just the changing part of single-line JSON).
   */
  inline?: { old: string; next: string };
}

function findContextLine(lines: string[], context: string, start: number): number | null {
  let idx = seekSequence(lines, [context], start, false);
  if (idx === null && context.length > 0) {
    const normCtx = normalise(context);
    for (let i = start; i < lines.length; i++) {
      if (normalise(lines[i]).includes(normCtx)) {
        idx = i;
        break;
      }
    }
  }
  return idx;
}

function seekOldLines(
  originalLines: string[],
  pattern: string[],
  start: number,
  eof: boolean,
): number | null {
  let found = seekSequence(originalLines, pattern, start, eof);
  if (found === null && start > 0) {
    found = seekSequence(originalLines, pattern, 0, eof);
  }
  return found;
}

function nearestMismatchHint(originalLines: string[], oldLines: string[]): string {
  const first = oldLines[0] ?? '';
  const needle = normalise(first);
  let bestI = 0;
  let bestScore = -1;
  for (let i = 0; i < originalLines.length; i++) {
    const hay = normalise(originalLines[i]);
    let score = 0;
    const n = Math.min(hay.length, needle.length);
    for (let k = 0; k < n; k++) {
      if (hay[k] === needle[k]) score++;
    }
    if (needle.length > 0 && (hay.includes(needle) || needle.includes(hay))) score += 40;
    if (score > bestScore) {
      bestScore = score;
      bestI = i;
    }
  }
  const preview = oldLines.slice(0, 8).join('\n');
  const fileLine = originalLines[bestI] ?? '';
  return (
    `Looking for:\n${preview}\n` +
    `First mismatch vs nearest file lines (around line ${bestI + 1}):\n` +
    `  expected: ${first}\n` +
    `  file:     ${fileLine}\n` +
    `Re-read the file and send a smaller hunk (3–8 context lines) that copies file bytes exactly.`
  );
}

function expectedLinesError(path: string, originalLines: string[], oldLines: string[]): string {
  return `Failed to find expected lines in ${path}\n${nearestMismatchHint(originalLines, oldLines)}`;
}

function computeReplacements(
  originalLines: string[],
  path: string,
  chunks: UpdateFileChunk[],
): { rej: true; error: string } | { rej: false; replacements: Replacement[] } {
  const replacements: Replacement[] = [];
  let lineIndex = 0;
  for (const chunk of chunks) {
    if (chunk.changeContext !== null) {
      // `@@ heading` is a locator. Models often repeat that heading as the first
      // context/`-` line — do not skip past it. A bogus heading is ignored when
      // oldLines can still be found (wrong @@ comments are common on CSS).
      let idx = findContextLine(originalLines, chunk.changeContext, lineIndex);
      if (idx === null && lineIndex > 0) {
        idx = findContextLine(originalLines, chunk.changeContext, 0);
      }
      if (idx === null) {
        if (chunk.oldLines.length === 0) {
          return { rej: true, error: `Failed to find context '${chunk.changeContext}' in ${path}` };
        }
        // Keep lineIndex; seekOldLines will retry from 0 if needed.
      } else if (chunk.oldLines.length === 0) {
        lineIndex = idx + 1;
      } else {
        // Search from the heading line itself so a duplicated @@ selector still matches.
        lineIndex = idx;
      }
    }

    if (chunk.oldLines.length === 0) {
      const hasTrailingEmpty = originalLines.length > 0 && originalLines[originalLines.length - 1] === '';
      const insertionIdx = hasTrailingEmpty ? originalLines.length - 1 : originalLines.length;
      replacements.push({ start: insertionIdx, oldLen: 0, newLines: [...chunk.newLines] });
      continue;
    }

    let pattern = chunk.oldLines;
    let newSlice = chunk.newLines;
    let found = seekOldLines(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    if (found === null && pattern.length > 0 && pattern[pattern.length - 1] === '') {
      pattern = pattern.slice(0, -1);
      if (newSlice.length > 0 && newSlice[newSlice.length - 1] === '') {
        newSlice = newSlice.slice(0, -1);
      }
      found = seekOldLines(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    }

    if (found !== null) {
      replacements.push({ start: found, oldLen: pattern.length, newLines: [...newSlice] });
      lineIndex = found + pattern.length;
    } else if (pattern.length === 1) {
      // Whole-line matching failed. Fall back to a substring match for a
      // single-line pattern (models often match just the changing part of a
      // single-line file like /deck.json). Since `normalise` is 1:1 per
      // character, the normalized index maps directly onto the original line.
      const pat = pattern[0];
      const normPat = normalise(pat);
      let inlineFound = -1;
      if (normPat.length > 0) {
        for (let i = 0; i < originalLines.length; i++) {
          if (normalise(originalLines[i]).includes(normPat)) {
            inlineFound = i;
            break;
          }
        }
      }
      if (inlineFound !== -1) {
        const next = newSlice.length > 0 ? newSlice.join('\n') : '';
        replacements.push({
          start: inlineFound,
          oldLen: 0,
          newLines: [],
          inline: { old: pat, next },
        });
        lineIndex = inlineFound + 1;
      } else {
        return {
          rej: true,
          error: expectedLinesError(path, originalLines, chunk.oldLines),
        };
      }
    } else {
      return {
        rej: true,
        error: expectedLinesError(path, originalLines, chunk.oldLines),
      };
    }
  }
  replacements.sort((a, b) => a.start - b.start);
  return { rej: false, replacements };
}

function applyReplacements(lines: string[], replacements: Replacement[]): string[] {
  const ordered = [...replacements].sort((a, b) => b.start - a.start);
  for (const { start, oldLen, newLines, inline } of ordered) {
    if (inline) {
      // In-line substring replacement: map the normalized pattern back onto the
      // original line (normalise is 1:1 per code point) and swap the substring.
      const line = lines[start];
      const idx = normalise(line).indexOf(normalise(inline.old));
      if (idx !== -1) {
        lines[start] = line.slice(0, idx) + inline.next + line.slice(idx + inline.old.length);
      }
      continue;
    }
    for (let i = 0; i < oldLen; i++) {
      if (start < lines.length) lines.splice(start, 1);
    }
    for (let off = 0; off < newLines.length; off++) {
      lines.splice(start + off, 0, newLines[off]);
    }
  }
  return lines;
}

/**
 * Apply `chunks` to `originalText`, returning the new file contents. Mirrors
 * Codex `derive_new_contents_from_chunks`.
 */
export function deriveNewContents(
  originalText: string,
  chunks: UpdateFileChunk[],
  path = '<file>',
): ApplyDiffResult {
  const originalLines = splitFileLines(originalText ?? '');
  const res = computeReplacements(originalLines, path, chunks);
  if (res.rej) return { ok: false, error: res.error };
  const newLines = applyReplacements(originalLines, res.replacements);
  if (!(newLines.length > 0 && newLines[newLines.length - 1] === '')) newLines.push('');
  return { ok: true, text: newLines.join('\n') };
}

/** How {@link applyDiff} interprets the patch body. Mirrors OpenAI Agents SDK. */
export type ApplyDiffMode = 'default' | 'create';

/**
 * Normalize a diff into lines, dropping a single trailing empty line from the
 * split (so a trailing newline on the payload does not become a phantom line).
 */
function normalizeDiffLines(diff: string): string[] {
  const lines = diff.replace(/\r\n/g, '\n').split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Ensure file text ends with a trailing newline (VFS convention for created
 * files). Empty content stays empty.
 */
function withTrailingNewline(text: string): string {
  if (text.length === 0) return text;
  return text.endsWith('\n') ? text : `${text}\n`;
}

/**
 * Create-file V4A body → full file contents.
 *
 * Matches OpenAI Agents SDK `applyDiff("", diff, "create")`: every content line
 * is a `+` line. Practical leniencies (models often mix formats on first try):
 * - optional bare `@@` / `@@ context` headers are ignored (update-style noise)
 * - if NO line is `+`-prefixed, treat the whole body as raw file content
 *   (so bare markdown / HTML creates succeed instead of failing on the first try)
 * - blank lines without a `+` are treated as empty content lines when the rest
 *   of the body is `+`-prefixed
 */
function isHunkHeaderLine(line: string): boolean {
  if (isEnvelopeOrGitFileHeader(line)) return true;
  const t = line.trimEnd();
  return (
    t === EMPTY_CHANGE_CONTEXT_MARKER ||
    t.startsWith(CHANGE_CONTEXT_MARKER) ||
    GIT_HUNK_HEADER.test(t) ||
    t === EOF_MARKER
  );
}

export function parseCreateDiff(diff: string): ApplyDiffResult {
  const lines = normalizeDiffLines(diff);
  // Drop @@ headings, git/Codex envelopes — create/rewrite bodies are file bytes.
  const contentLines = lines.filter((l) => !isHunkHeaderLine(l));

  if (contentLines.length === 0) {
    return { ok: false, error: 'Error: empty diff' };
  }

  const plusOrBlank = contentLines.every((l) => l.startsWith('+') || l.length === 0);
  const anyPlus = contentLines.some((l) => l.startsWith('+'));

  if (plusOrBlank && anyPlus) {
    // Strict create path (OpenAI SDK): strip one leading '+' per content line.
    const body = contentLines.map((l) => (l.startsWith('+') ? l.slice(1) : '')).join('\n');
    return { ok: true, text: withTrailingNewline(body) };
  }

  if (!anyPlus) {
    // Pure raw body — no '+' markers at all. Accept as full file contents so a
    // first-try create_file of markdown/HTML does not bounce on prefix rules.
    // Lines may start with '-' (markdown lists) or '#' (headings); those are
    // content, not update hunks.
    const body = contentLines.join('\n');
    return { ok: true, text: withTrailingNewline(body) };
  }

  // Mixed: some '+' lines and some bare lines. Models often drop the '+'
  // on a single content line (commonly a long line or one containing a
  // multibyte arrow like →). In create mode every line is content, so
  // strip '+' where present and keep bare lines verbatim; bare '- ' / '  - '
  // lines are markdown lists or indentation, not update hunks (create_file
  // has no deletion semantics).
  const body = contentLines.map((l) => (l.startsWith('+') ? l.slice(1) : l)).join('\n');
  return { ok: true, text: withTrailingNewline(body) };
}

/**
 * Apply a bare V4A-style diff to `originalText`.
 *
 * - `mode: 'default'` (update): `@@` hunks with ` ` / `+` / `-` lines, matching
 *   OpenAI Agents SDK / Codex update semantics.
 * - `mode: 'create'`: create-file body — prefer every line `+`-prefixed; see
 *   {@link parseCreateDiff}. Use this from `create_file` (not default + empty
 *   original), matching `applyDiff("", diff, "create")` in the SDK docs.
 */
/**
 * True when an update diff is only `+` lines (and optional `@@` headers): models
 * use this as a whole-file rewrite after a failed surgical hunk.
 */
function isPlusOnlyRewrite(diff: string): boolean {
  const content = normalizeDiffLines(diff).filter((l) => !isHunkHeaderLine(l));
  if (content.length === 0) return false;
  const anyPlus = content.some((l) => l.startsWith('+'));
  // No ` ` context and no `-` deletions: this is a full-file body, even if the
  // model put a path or selector on the @@ heading (`@@ /pages/index.html`).
  return anyPlus && content.every((l) => l.startsWith('+') || l.length === 0);
}

export function applyDiff(
  originalText: string,
  diff: string,
  mode: ApplyDiffMode = 'default',
  path = '<file>',
): ApplyDiffResult {
  if (mode === 'create') {
    return parseCreateDiff(diff);
  }

  if (isPlusOnlyRewrite(diff)) {
    return parseCreateDiff(diff);
  }

  let chunks: UpdateFileChunk[];
  try {
    chunks = parseUpdateChunks(diff);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (chunks.length === 0) return { ok: false, error: 'Error: empty diff' };
  return deriveNewContents(originalText ?? '', chunks, path);
}
