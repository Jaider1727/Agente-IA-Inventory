'use strict';

const { parseMessage } = require('../src/webhook/messageParser');

function makeBody(message) {
  return { entry: [{ changes: [{ value: { messages: [message] } }] }] };
}

describe('parseMessage', () => {
  test('parses a text message', () => {
    const body = makeBody({ from: '573001234567', type: 'text', text: { body: 'hola' } });
    expect(parseMessage(body)).toEqual({ from: '573001234567', type: 'text', text: 'hola' });
  });

  test('parses an audio message', () => {
    const body = makeBody({ from: '573001234567', type: 'audio', audio: { id: 'media-abc' } });
    expect(parseMessage(body)).toEqual({ from: '573001234567', type: 'audio', mediaId: 'media-abc' });
  });

  test('returns null for unsupported message type', () => {
    const body = makeBody({ from: '573001234567', type: 'image', image: { id: 'img-1' } });
    expect(parseMessage(body)).toBeNull();
  });

  test('returns null when there are no messages (status update)', () => {
    const body = { entry: [{ changes: [{ value: {} }] }] };
    expect(parseMessage(body)).toBeNull();
  });

  test('returns null for null body', () => {
    expect(parseMessage(null)).toBeNull();
  });

  test('returns null for empty object', () => {
    expect(parseMessage({})).toBeNull();
  });
});
