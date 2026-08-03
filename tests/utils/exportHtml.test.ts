import { test, expect, describe } from 'bun:test';
import {
  exportConversationToHtml,
  makeExportBasename,
  __exportHtmlTemplates,
} from '../../src/utils/exportHtml.ts';
import type { Conversation, Message } from '../../src/types/index.ts';

const makeConversation = (): Conversation => ({
  id: 'conv-1',
  title: 'My Conversation: Test!',
  createdAt: 1700000000000,
  updatedAt: 1700000100000,
});

const makeMessages = (): Message[] => [
  {
    role: 'user',
    content: 'Hello **world** with `code`',
    displayContent: 'Hello **world** with `code`',
    attachments: [{ type: 'image', name: 'pic.png', data: 'aGVsbG8=' }],
  },
  {
    role: 'assistant',
    content: 'Here is a response with a code block:\n\n```ts\nconst x = 1;\n```',
    reasoningContent: 'secret reasoning here',
    toolCalls: [{ id: 't1', name: 'bash', arguments: '{"command":"ls"}' }],
    toolResults: [{ toolCallId: 't1', name: 'bash', content: 'file.txt', status: 'success' }],
  },
  {
    role: 'tool',
    content: 'ls output',
    name: 'bash',
  },
];

describe('exportHtml', () => {
  test('produces a self-contained HTML document', async () => {
    const html = await exportConversationToHtml(makeConversation(), makeMessages(), {
      markedSource: '/* marked */',
      hljsSource: '/* hljs */',
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('My Conversation: Test!');
    expect(html).toContain('/* marked */');
    expect(html).toContain('/* hljs */');
    // The title is also HTML-escaped in the <title> tag
    expect(html).toContain('<title>My Conversation: Test! · BraceKit Export</title>');
  });

  test('embeds conversation data as base64 in a script tag', async () => {
    const html = await exportConversationToHtml(makeConversation(), makeMessages(), {
      markedSource: 'x',
      hljsSource: 'y',
    });

    const match = html.match(/<script id="bk-session-data" type="application\/json">([^<]+)<\/script>/);
    expect(match).not.toBeNull();
    const base64 = match![1];

    // Decode the base64 and verify the JSON payload is intact
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const payload = JSON.parse(new TextDecoder('utf-8').decode(bytes));

    expect(payload.title).toBe('My Conversation: Test!');
    expect(payload.messages).toHaveLength(3);
    expect(payload.messages[0].role).toBe('user');
    expect(payload.messages[0].content).toBe('Hello **world** with `code`');
    expect(payload.messages[1].reasoningContent).toBe('secret reasoning here');
    expect(payload.messages[1].toolCalls[0].name).toBe('bash');
  });

  test('escapes user content that could break out of the script tag', async () => {
    const msgs: Message[] = [
      { role: 'user', content: 'malicious </script><script>alert(1)</script>' },
    ];
    const html = await exportConversationToHtml(makeConversation(), msgs, {
      markedSource: 'x',
      hljsSource: 'y',
    });

    // The JSON payload must not contain a raw </script> sequence
    const match = html.match(/<script id="bk-session-data" type="application\/json">([^<]+)<\/script>/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain('</script>');
  });

  test('makeExportBasename sanitizes the conversation title', () => {
    const conv = { ...makeConversation(), title: 'Ask: What is 2+2?' };
    const base = makeExportBasename(conv);
    expect(base).toBe('Ask_What_is_2_2_2023-11-14');
  });

  test('makeExportBasename falls back for empty title', () => {
    const conv = { ...makeConversation(), title: '' };
    expect(makeExportBasename(conv)).toMatch(/^conversation_/);
  });

  test('templates are exported for inspection', () => {
    expect(__exportHtmlTemplates.css).toContain('--bk-primary');
    expect(__exportHtmlTemplates.js).toContain('bk-session-data');
    expect(__exportHtmlTemplates.js).toContain('marked.use');
  });

  test('renderer wraps tables in a scrollable container for responsiveness', () => {
    // The embedded renderer must wrap <table> in .bk-table-wrap so wide
    // tables scroll horizontally on small screens instead of overflowing.
    expect(__exportHtmlTemplates.js).toContain('bk-table-wrap');
    expect(__exportHtmlTemplates.js).toContain('html.replace(/<table>');
    expect(__exportHtmlTemplates.css).toContain('.bk-table-wrap');
    expect(__exportHtmlTemplates.css).toContain('overflow-x: auto');
  });
});