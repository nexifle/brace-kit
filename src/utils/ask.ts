import type { AskField, AskPayload, AskQuestion } from '../types/ask.ts';

/** Normalize current and legacy ask arguments into the canonical payload shape. */
export function normalizeAskPayload(payload: unknown): AskPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  if (typeof p.question === 'string' && p.question) {
    return {
      questions: [{
        id: 'q1',
        text: p.question,
        options: Array.isArray(p.options) ? p.options.filter((o): o is string => typeof o === 'string') : undefined,
        ...(p.multiple === true ? { multiple: true } : {}),
        ...(p.freeText === true ? { freeText: true } : {}),
        ...(parseAskField(p.field) ? { field: parseAskField(p.field) } : {}),
      }],
    };
  }

  if (!Array.isArray(p.questions)) return null;
  const questions = p.questions
    .map((raw, index) => normalizeAskQuestion(raw, `q${index + 1}`))
    .filter((q): q is AskQuestion => q !== null);
  return questions.length > 0 ? { questions } : null;
}

const ASK_FIELDS: ReadonlySet<AskField> = new Set([
  'canvas', 'slide_count', 'audience', 'topic', 'style', 'brand', 'other',
]);

function parseAskField(value: unknown): AskField | undefined {
  return typeof value === 'string' && ASK_FIELDS.has(value as AskField)
    ? value as AskField
    : undefined;
}

function normalizeAskQuestion(raw: unknown, fallbackId: string): AskQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const text = typeof q.question === 'string' && q.question ? q.question :
    typeof q.text === 'string' && q.text ? q.text : '';
  if (!text) return null;
  return {
    id: typeof q.id === 'string' && q.id ? q.id : fallbackId,
    text,
    options: Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string') : undefined,
    ...(q.multiple === true ? { multiple: true } : {}),
    ...(q.freeText === true ? { freeText: true } : {}),
    ...(parseAskField(q.field) ? { field: parseAskField(q.field) } : {}),
  };
}

/** Recover a pending ask from the persisted assistant/tool message pair. */
export function findPendingAsk(messages: Array<{
  role: string;
  content: string;
  toolCallId?: string;
  createdAt?: number;
  toolCalls?: Array<{ id: string; arguments: string }>;
}>): import('../types/ask.ts').PendingAsk | null {
  const pendingTool = [...messages].reverse().find(
    (message) => message.role === 'tool' && message.content === 'Waiting for your answer…' && message.toolCallId
  );
  if (!pendingTool) return null;
  const assistant = [...messages].reverse().find(
    (message) => message.role === 'assistant' && message.toolCalls?.some((call) => call.id === pendingTool.toolCallId)
  );
  const call = assistant?.toolCalls?.find((candidate) => candidate.id === pendingTool.toolCallId);
  if (!call) return null;
  try {
    const payload = normalizeAskPayload(JSON.parse(call.arguments || '{}'));
    return payload ? {
      id: `ask_${pendingTool.toolCallId}`,
      toolCallId: pendingTool.toolCallId!,
      payload,
      createdAt: pendingTool.createdAt ?? Date.now(),
    } : null;
  } catch {
    return null;
  }
}

/** True when the conversation is suspended or already in-flight and must not accept a new user turn. */
export function isChatSendBlocked(state: {
  pendingAsk: unknown;
  isStreaming: boolean;
  isCompacting: boolean;
  activeConversationId: string | null;
  streamingConversations: Record<string, unknown>;
}): boolean {
  const isConvStreaming = state.activeConversationId
    ? !!state.streamingConversations[state.activeConversationId]
    : false;
  return !!(state.pendingAsk || state.isStreaming || isConvStreaming || state.isCompacting);
}

/** Serialize answers using the legacy scalar form for one question. */
export function buildAskAnswer(
  questions: AskQuestion[],
  answers: Record<string, string | string[]>,
  freeTexts: Record<string, string> = {},
): string {
  const merged: Record<string, string | string[]> = {};
  for (const q of questions) {
    const free = (freeTexts[q.id] ?? '').trim();
    const value = answers[q.id];
    merged[q.id] = Array.isArray(value) ? (free ? [...value, free] : value) : free || value || '';
  }
  if (questions.length === 1) {
    const value = merged[questions[0].id];
    return Array.isArray(value) ? value.join(', ') : value;
  }
  return JSON.stringify(merged);
}
