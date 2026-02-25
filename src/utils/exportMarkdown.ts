import type { Message, Conversation } from '../types/index.ts';

export function exportConversationToMarkdown(
  conversation: Conversation,
  messages: Message[]
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`**Created:** ${new Date(conversation.createdAt).toLocaleString()}`);
  lines.push(`**Updated:** ${new Date(conversation.updatedAt).toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Messages
  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('## 👤 User');
      lines.push('');
      lines.push(msg.displayContent || msg.content);
      
      if (msg.attachments && msg.attachments.length > 0) {
        lines.push('');
        lines.push('**Attachments:**');
        for (const att of msg.attachments) {
          lines.push(`- ${att.name} (${att.type})`);
        }
      }
    } else if (msg.role === 'assistant') {
      lines.push('## 🤖 Assistant');
      lines.push('');
      
      if (msg.reasoningContent) {
        lines.push('<details>');
        lines.push('<summary>💭 Reasoning</summary>');
        lines.push('');
        lines.push(msg.reasoningContent);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
      
      lines.push(msg.content);
      
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        lines.push('');
        lines.push('**Tool Calls:**');
        for (const tc of msg.toolCalls) {
          lines.push(`- \`${tc.name}\`: ${tc.arguments}`);
        }
      }
    } else if (msg.role === 'tool') {
      lines.push(`### 🔧 Tool: ${msg.name}`);
      lines.push('');
      lines.push('```');
      lines.push(msg.content);
      lines.push('```');
    }
    
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
