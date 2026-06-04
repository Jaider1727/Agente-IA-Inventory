'use strict';

const { safeTruncate } = require('../src/session/sessionStore');

const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });
const assistantWithTools = () => ({ role: 'assistant', content: null, tool_calls: [{ id: 'tc-1' }] });
const tool = () => ({ role: 'tool', tool_call_id: 'tc-1', content: 'result' });

describe('safeTruncate', () => {
  test('returns messages as-is when at or below MAX_MESSAGES (10)', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => user(`msg ${i}`));
    expect(safeTruncate(msgs)).toEqual(msgs);
  });

  test('truncates to last 10 when all messages are user messages', () => {
    const msgs = Array.from({ length: 15 }, (_, i) => user(`msg ${i}`));
    const result = safeTruncate(msgs);
    expect(result.length).toBe(10);
    expect(result[0]).toEqual(user('msg 5'));
  });

  test('strips leading orphan tool messages to avoid OpenAI 400', () => {
    // Slice lands on an orphan tool message — safeTruncate must walk forward
    const msgs = [
      ...Array.from({ length: 7 }, () => user('old')),
      assistantWithTools(),
      tool(),
      user('new question'),
      assistant('answer'),
    ];
    // 11 messages → slice(-10) starts at index 1 → assistantWithTools (has tool_calls, no content)
    // safeTruncate must advance until it finds a safe start
    const result = safeTruncate(msgs);
    expect(result[0].role).toBe('user');
  });

  test('preserves a clean assistant message as a valid start', () => {
    // 11 messages total: slice(-10) starts at index 1 = assistant('clean response').
    // The while loop breaks immediately — clean assistant is a valid start.
    const msgs = [
      user('oldest'),                                         // index 0 — cut off by slice
      assistant('clean response'),                            // index 1 — first in slice
      ...Array.from({ length: 9 }, () => user('filler')),   // indices 2-10
    ];
    const result = safeTruncate(msgs);
    expect(result[0].role).toBe('assistant');
    expect(result[0].content).toBe('clean response');
  });

  test('returns empty array if all messages after truncation are orphan tool messages', () => {
    const msgs = Array.from({ length: 15 }, () => tool());
    const result = safeTruncate(msgs);
    expect(result).toEqual([]);
  });
});
