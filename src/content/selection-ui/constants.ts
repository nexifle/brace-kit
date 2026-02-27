import type { QuickAction } from './types.ts';

/**
 * Quick actions for text selection
 * - isPrimary: true = shown directly in toolbar
 * - isPrimary: false = shown in "More" dropdown menu
 */
export const QUICK_ACTIONS: QuickAction[] = [
  // === Primary Actions (shown in toolbar) ===
  {
    id: 'summarize',
    label: 'Summarize',
    icon: 'summarize',
    isPrimary: true,
    category: 'analysis',
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
    icon: 'explain',
    isPrimary: true,
    category: 'analysis',
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
    icon: 'translate',
    isPrimary: true,
    category: 'transform',
    requiresTargetLang: true,
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
  },
  {
    id: 'rephrase',
    label: 'Rephrase',
    icon: 'rephrase',
    isPrimary: true,
    category: 'transform',
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

  // === Secondary Actions (shown in "More" menu) ===
  {
    id: 'simplify',
    label: 'Simplify',
    icon: 'simplify',
    isPrimary: false,
    category: 'transform',
    prompt: (text: string) =>
      `You are an expert at simplifying complex text. Rewrite the following content to make it easier to understand while keeping all important information.

GUIDELINES:
- Use simpler words and shorter sentences
- Break down complex ideas into digestible parts
- Remove jargon and technical terms (or explain them simply)
- Keep the same meaning and key points
- Make it readable for a general audience

Return ONLY the simplified text, nothing else.

TEXT TO SIMPLIFY:
"""${text}"""`,
  },
  {
    id: 'expand',
    label: 'Expand',
    icon: 'expand',
    isPrimary: false,
    category: 'transform',
    prompt: (text: string) =>
      `You are an expert at expanding and elaborating on text. Add more detail, context, and depth to the following content.

GUIDELINES:
- Add relevant examples and illustrations
- Provide more context and background
- Elaborate on key points with additional details
- Maintain the original tone and style
- Don't add unrelated information

Return ONLY the expanded text, nothing else.

TEXT TO EXPAND:
"""${text}"""`,
  },
  {
    id: 'tone-formal',
    label: 'Make Formal',
    icon: 'formal',
    isPrimary: false,
    category: 'tone',
    prompt: (text: string) =>
      `You are a professional editor. Rewrite the following text to make it more formal and professional.

GUIDELINES:
- Use proper grammar and complete sentences
- Avoid contractions (use "do not" instead of "don't")
- Use professional vocabulary
- Remove slang, colloquialisms, and casual language
- Maintain the original meaning
- Keep appropriate level of formality (not overly stiff)

Return ONLY the formal version, nothing else.

TEXT TO MAKE FORMAL:
"""${text}"""`,
  },
  {
    id: 'tone-casual',
    label: 'Make Casual',
    icon: 'casual',
    isPrimary: false,
    category: 'tone',
    prompt: (text: string) =>
      `You are a skilled communicator. Rewrite the following text to make it more casual and conversational.

GUIDELINES:
- Use contractions naturally (it's, you're, we're)
- Use simpler, everyday language
- Make it sound like you're talking to a friend
- Add personality where appropriate
- Keep the core message intact
- Don't use excessive slang

Return ONLY the casual version, nothing else.

TEXT TO MAKE CASUAL:
"""${text}"""`,
  },
  {
    id: 'fix-grammar',
    label: 'Fix Grammar',
    icon: 'grammar',
    isPrimary: false,
    category: 'fix',
    prompt: (text: string) =>
      `You are a professional proofreader. Fix all grammar, spelling, and punctuation errors in the following text.

GUIDELINES:
- Correct all grammatical errors
- Fix spelling mistakes
- Improve punctuation where needed
- Don't change the meaning or style
- Keep the original tone
- Only fix errors, don't rewrite good content

Return ONLY the corrected text, nothing else.

TEXT TO FIX:
"""${text}"""`,
  },
];

// Maximum number of primary actions to show in toolbar
export const MAX_PRIMARY_ACTIONS = 4;

// Categories for grouping actions in menu
export const ACTION_CATEGORIES: Record<string, { label: string; order: number }> = {
  analysis: { label: 'Analyze', order: 1 },
  transform: { label: 'Transform', order: 2 },
  tone: { label: 'Change Tone', order: 3 },
  fix: { label: 'Fix & Improve', order: 4 },
};

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
