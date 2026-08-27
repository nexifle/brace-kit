import { describe, expect, it } from 'bun:test';
import { formatMessageForAPI } from '../../src/utils/formatMessageForAPI.ts';
import { updateToolMessage } from '../../src/services/chatToolExecutor.ts';
import { useStore } from '../../src/store/index.ts';
import type { Message } from '../../src/types/index.ts';

describe('formatMessageForAPI ask attachments', () => {
  it('includes reference images on a resumed ask tool result', () => {
    useStore.setState({
      messages: [
        {
          role: 'tool',
          toolCallId: 'ask_tc',
          name: 'ask',
          content: 'Waiting for your answer…',
        } satisfies Message,
      ],
    });

    const dataUrl = 'data:image/png;base64,aaa';
    updateToolMessage('ask_tc', '16:9', [{ type: 'image', name: 'ask-ref-1', data: dataUrl }]);

    const toolMsg = useStore.getState().messages[0];
    expect(toolMsg.content).toBe('16:9');
    expect(toolMsg.attachments).toEqual([{ type: 'image', name: 'ask-ref-1', data: dataUrl }]);

    const api = formatMessageForAPI(toolMsg);
    expect(api?.role).toBe('tool');
    expect(api?.content).toEqual([
      { type: 'text', text: '16:9' },
      { type: 'image_url', image_url: { url: dataUrl } },
    ]);
  });

  it('omits hosted web_search tool rows from the API payload', () => {
    const api = formatMessageForAPI({
      role: 'tool',
      name: 'web_search',
      toolCallId: 'ws_1',
      content: 'query',
      toolExecution: 'hosted',
      toolArguments: { query: 'xai docs' },
    });
    expect(api).toBeNull();
  });
});
