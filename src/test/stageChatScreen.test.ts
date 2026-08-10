import { describe, expect, it } from 'vitest';
import {
  STAGE_CHAT_MAX_MESSAGES,
  STAGE_CHAT_MAX_MESSAGE_CHARS,
  clampStageChat,
  parseStageChat,
} from '@/utils/stageChatScreen';
import type { StageChatScreen } from '@/types/liveClass';

/**
 * The wire half of the chat mirror. Pure, so it is tested pure.
 *
 * Two assertions earn their keep and neither is ordinary clamping:
 *
 *  · `sentCount` is NOT rebased onto the cut window. It answers "how many times
 *    did the learner send", and recomputing it from the surviving messages would
 *    turn a long conversation into "he did nothing" the moment it got long
 *    enough to be worth projecting.
 *  · An unknown `role` falls to `assistant`, never to `user`. A bubble on the
 *    learner's side is an assertion about a PERSON, and a malformed payload must
 *    not be able to make one.
 */

function screen(over: Partial<StageChatScreen> = {}): StageChatScreen {
  return {
    messages: [
      { role: 'assistant', text: 'Manda seu pedido que eu respondo.' },
      { role: 'user', text: 'Me explica o que é contexto pra uma IA.' },
      { role: 'assistant', text: 'Contexto é o que você entrega junto do pedido.' },
    ],
    stepIdx: 1,
    stepCount: 2,
    stepPrompt: 'Essa resposta foi boa? Avalia.',
    won: false,
    sentCount: 1,
    ...over,
  };
}

describe('clampStageChat', () => {
  it('passes a short conversation through unchanged', () => {
    const s = screen();
    expect(clampStageChat(s)).toEqual(s);
  });

  it('keeps the END of a long conversation — the last turns are what the room reads', () => {
    const messages = Array.from({ length: STAGE_CHAT_MAX_MESSAGES + 8 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `turn ${i}`,
    }));
    const out = clampStageChat(screen({ messages }));
    expect(out.messages).toHaveLength(STAGE_CHAT_MAX_MESSAGES);
    expect(out.messages[out.messages.length - 1]!.text).toBe(`turn ${messages.length - 1}`);
    expect(out.messages[0]!.text).toBe('turn 8');
  });

  /**
   * The one that would be wrong if it were "obvious". Cutting the front is a
   * BANDWIDTH decision; it must not silently become a claim about the learner.
   */
  it('does NOT rebase sentCount onto the cut window', () => {
    const messages = Array.from({ length: STAGE_CHAT_MAX_MESSAGES + 8 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `turn ${i}`,
    }));
    const out = clampStageChat(screen({ messages, sentCount: 24 }));
    expect(out.sentCount).toBe(24);
  });

  it('caps a runaway turn instead of dropping it', () => {
    const out = clampStageChat(
      screen({ messages: [{ role: 'user', text: 'x'.repeat(9000) }], sentCount: 1 }),
    );
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0]!.text.length).toBe(STAGE_CHAT_MAX_MESSAGE_CHARS + 1);
    expect(out.messages[0]!.text.endsWith('…')).toBe(true);
  });
});

describe('parseStageChat — the reading edge', () => {
  it('round-trips a clamped conversation', () => {
    const s = clampStageChat(screen());
    expect(parseStageChat(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('rejects anything that is not a conversation', () => {
    expect(parseStageChat(null)).toBeUndefined();
    expect(parseStageChat('nope')).toBeUndefined();
    expect(parseStageChat({})).toBeUndefined();
    expect(parseStageChat({ messages: 'nope' })).toBeUndefined();
  });

  it('drops turns with no text instead of rendering an empty bubble', () => {
    const out = parseStageChat({ messages: [{ role: 'user' }, { role: 'user', text: 'oi' }] })!;
    expect(out.messages).toEqual([{ role: 'user', text: 'oi' }]);
  });

  /**
   * An unknown role must never land on the LEARNER's side. Attribution is the
   * whole product here: the stage names the person above the transcript.
   */
  it('attributes an unknown role to the sandbox, never to the learner', () => {
    const out = parseStageChat({ messages: [{ role: 'system', text: 'quem disse isso?' }] })!;
    expect(out.messages[0]!.role).toBe('assistant');
  });

  it('re-applies the cap on data from another build', () => {
    const messages = Array.from({ length: 200 }, (_, i) => ({ role: 'user', text: `t${i}` }));
    const out = parseStageChat({ messages, sentCount: 200 })!;
    expect(out.messages).toHaveLength(STAGE_CHAT_MAX_MESSAGES);
    expect(out.sentCount).toBe(200);
  });
});
