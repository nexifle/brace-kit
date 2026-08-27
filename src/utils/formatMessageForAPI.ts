import type { APIMessage, Message } from '../types/index.ts';

/** Format a stored chat message for the provider API. */
export function formatMessageForAPI(msg: Message): APIMessage | null {
  if (msg.role === 'error') return null;

  if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: msg.content || '',
      toolCalls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments || '{}',
        ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
      })),
      ...(msg.reasoningContent && { reasoningContent: msg.reasoningContent }),
      ...(msg.reasoningSignature && { reasoningSignature: msg.reasoningSignature }),
      ...(msg.backendItems && msg.backendItems.length > 0 && { backendItems: msg.backendItems }),
    };
  }

  if (msg.role === 'tool') {
    // Hosted tools are transcript rows for the grouped tool chain. The API
    // replay is the sibling `web_search_call` on the following assistant
    // (`backendItems`), matching grok-build's BackendToolCall items.
    if (msg.toolExecution === 'hosted') return null;
    const images = (msg.attachments ?? []).filter((a) => a.type === 'image' && a.data);
    if (images.length === 0) {
      return {
        role: 'tool',
        toolCallId: msg.toolCallId,
        name: msg.name,
        content: msg.content,
      };
    }
    const content: { type: string; text?: string; image_url?: { url: string } }[] = [];
    if (msg.content) content.push({ type: 'text', text: msg.content });
    for (const att of images) {
      content.push({ type: 'image_url', image_url: { url: att.data } });
    }
    return {
      role: 'tool',
      toolCallId: msg.toolCallId,
      name: msg.name,
      content,
    };
  }

  if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
    const images = msg.attachments.filter((a) => a.type === 'image');
    const texts = msg.attachments.filter((a) => a.type === 'text');

    let textContent = msg.content || '';
    for (const att of texts) {
      textContent += `\n\n--- ${att.name} ---\n${att.data}`;
    }

    if (images.length === 0) {
      return { role: msg.role, content: textContent };
    }

    const content: { type: string; text?: string; image_url?: { url: string } }[] = [];
    if (textContent) content.push({ type: 'text', text: textContent });
    for (const att of images) {
      content.push({ type: 'image_url', image_url: { url: att.data } });
    }
    return { role: msg.role, content };
  }

  return {
    role: msg.role,
    content: msg.content,
    ...(msg.reasoningContent && { reasoningContent: msg.reasoningContent }),
    ...(msg.reasoningSignature && { reasoningSignature: msg.reasoningSignature }),
    ...(msg.role === 'assistant' &&
      msg.backendItems &&
      msg.backendItems.length > 0 && { backendItems: msg.backendItems }),
  };
}
