import type { QuickAction } from './types.ts';

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'summarize',
    label: 'Summarize',
    icon: '✂️',
    prompt: (text: string) =>
      `You are a professional summarizer. Create a concise, high-quality summary of the text below.

GUIDELINES:
- Extract only the key points and main ideas
- Remove all redundant details, examples, and tangential information
- Maintain the original meaning and tone
- Use clear, direct language
- Output 1-3 short paragraphs maximum
- Do NOT use phrases like "This text discusses..." or "The summary is..."
- Do NOT include any meta-commentary or explanation

Return ONLY the final summary text, nothing else.

TEXT TO SUMMARIZE:
"""${text}"""`,
  },
  {
    id: 'explain',
    label: 'Explain',
    icon: '💡',
    prompt: (text: string) =>
      `You are an expert educator. Explain the following content in clear, simple terms that anyone can understand.

GUIDELINES:
- Break down complex concepts into understandable parts
- Use analogies where helpful (but keep them brief)
- Explain technical terms when they appear
- Maintain factual accuracy while simplifying
- Use everyday language, avoid jargon
- Keep explanations concise and practical
- Do NOT start with phrases like "This is about..." or "Let me explain..."
- Do NOT add concluding remarks or summaries

Return ONLY the explanation itself, nothing else.

CONTENT TO EXPLAIN:
"""${text}"""`,
  },
  {
    id: 'translate',
    label: 'Translate',
    icon: '🌐',
    prompt: (text: string, targetLang = 'English') =>
      `You are a professional translator. Translate the following text into ${targetLang}.

GUIDELINES:
- Preserve the original meaning with maximum accuracy
- Match the original tone (formal/informal, technical/casual)
- Maintain the original structure unless it doesn't work in ${targetLang}
- Use natural, fluent phrasing as a native speaker would write
- Keep proper nouns in their original form unless they have standard translations
- Do NOT add translator notes, footnotes, or explanations
- Do NOT transliterate unless absolutely necessary

Return ONLY the translated text, nothing else.

TEXT TO TRANSLATE:
"""${text}"""`,
    requiresTargetLang: true,
  },
  {
    id: 'rephrase',
    label: 'Rephrase',
    icon: '📝',
    prompt: (text: string) =>
      `You are a professional editor. Rephrase the following text to improve its clarity, flow, and impact while preserving the original meaning.

GUIDELINES:
- Use varied vocabulary and sentence structures
- Improve readability and natural flow
- Fix awkward phrasing or wordiness
- Keep the same length (don't expand or condense significantly)
- Maintain the original tone and intent
- Use active voice where appropriate
- Do NOT add examples, elaborations, or new ideas
- Do NOT use phrases like "Here is the rephrased version..."

Return ONLY the rephrased text, nothing else.

TEXT TO REPHRASE:
"""${text}"""`,
  },
];

export const DEFAULT_MIN_SELECTION_LENGTH = 10;
export const TOOLBAR_HEIGHT = 48;
export const TOOLBAR_WIDTH = 200;
export const POPOVER_WIDTH = 360;
export const POPOVER_MAX_HEIGHT = 400;
export const GAP = 8;

// Rate limiting for AI requests
export const RATE_LIMIT_MS = 1000; // 1 second between requests

// Target languages for translation
export const TRANSLATION_TARGETS = [
  'English',
  'Spanish',
  'French',
  'German',
  'Chinese',
  'Japanese',
  'Korean',
  'Indonesian',
  'Portuguese',
  'Russian',
  'Arabic',
  'Hindi',
];

// Storage keys
export const STORAGE_KEYS = {
  ENABLED: 'textSelectionEnabled',
  MIN_LENGTH: 'textSelectionMinLength',
} as const;
