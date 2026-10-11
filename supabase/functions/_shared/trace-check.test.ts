import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import type { HtmlParser } from './grading.ts';
import { checkSelfReported, readTrace } from './trace-check.ts';

const parseHtml: HtmlParser = (source) => {
  const { document } = new JSDOM(source).window;
  return {
    count: (selector) => document.querySelectorAll(selector).length,
    text: (selector) => document.querySelector(selector)?.textContent ?? null,
    attr: (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? null,
  };
};

let clock = 1000;
const act = (type: string, payload?: Record<string, unknown>) => ({ type, at: (clock += 400), ...(payload ? { payload } : {}) });
const check = (kind: string, spec: unknown, trace: unknown, response: string | null = null) => checkSelfReported(kind, spec, { response, trace }, parseHtml);

const page = { elements: [{ id: 'titulo' }, { id: 'frase' }] };

describe('checkSelfReported', () => {
  it('refuses a scene with no trace at all', () => {
    expect(check('xray', { page, coverage_goal: 0.7 }, null)).toBe('trace_required');
    expect(check('inspect', { page }, [])).toBe('trace_required');
    expect(check('inspect', { page }, [{ type: 'gate_opened' }])).toBe('trace_required');
  });

  it('refuses a trace that does not end at the gate', () => {
    expect(check('inspect', { page }, [act('element_found', { element_id: 'titulo' })])).toBe('trace_rejected');
  });

  it('wants every piece of an inspect found, and every bug of a spot', () => {
    const half = [act('element_found', { element_id: 'titulo' }), act('gate_opened', { found: 2 })];
    expect(check('inspect', { page }, half)).toBe('trace_rejected');
    const all = [act('element_found', { element_id: 'titulo' }), act('element_found', { element_id: 'frase' }), act('gate_opened', { found: 2 })];
    expect(check('inspect', { page }, all)).toBeNull();
    const spot = { bugs: [{ id: 'estilo' }, { id: 'afastar' }] };
    expect(check('spot', spot, [act('element_found', { element_id: 'estilo' }), act('gate_opened', { bugs: 2 })])).toBe('trace_rejected');
    expect(check('spot', spot, [act('wrong_try', { bug_id: null }), act('element_found', { element_id: 'estilo' }), act('element_found', { element_id: 'afastar' }), act('gate_opened', { bugs: 2 })])).toBeNull();
  });

  it('compares the end of the gesture with the spec', () => {
    expect(check('xray', { page, coverage_goal: 0.7 }, [act('gate_opened', { coverage_goal: 0.7 })])).toBeNull();
    const arrange = { correct: ['id', 'classe', 'tag'] };
    expect(check('arrange', arrange, [act('order_changed', { order: ['id', 'tag', 'classe'] }), act('gate_opened', { order: ['id', 'tag', 'classe'] })])).toBe('trace_rejected');
    expect(check('arrange', arrange, [act('order_changed', { order: ['id', 'classe', 'tag'] }), act('gate_opened', { order: ['id', 'classe', 'tag'] })])).toBeNull();
    expect(check('dial', { target: [16, 28] }, [act('value_set', { value: 30 }), act('gate_opened', { value: 30 })])).toBe('trace_rejected');
    expect(check('dial', { target: [16, 28] }, [act('value_set', { value: 20 }), act('gate_opened', { value: 20 })])).toBeNull();
    expect(check('intercept', { answer: 'console' }, [act('wrong_try', { node_id: 'tela' }), act('gate_opened', { node_id: 'console' })])).toBeNull();
    expect(check('intercept', { answer: 'console' }, [act('gate_opened', { node_id: 'tela' })])).toBe('trace_rejected');
    expect(check('press', { goal: 3 }, [act('pressed', { count: 1 }), act('gate_opened', { presses: 3 })])).toBe('trace_rejected');
    expect(check('press', { goal: 3 }, [act('pressed', { count: 1 }), act('pressed', { count: 2 }), act('pressed', { count: 3 }), act('gate_opened', { presses: 3 })])).toBeNull();
    const wire = { pairs: [{ left_id: 'a', right_id: 'x' }, { left_id: 'b', right_id: 'y' }] };
    expect(check('wire', wire, [act('wire_connected', { left_id: 'a', right_id: 'x' }), act('gate_opened', { pairs: 2 })])).toBe('trace_rejected');
    expect(check('wire', wire, [act('wire_connected', { left_id: 'a', right_id: 'x' }), act('wire_connected', { left_id: 'b', right_id: 'y' }), act('gate_opened', { pairs: 2 })])).toBeNull();
    const bucket = { chips: [{ id: 'c1', bucket: 'padding' }, { id: 'c2', bucket: 'margin' }] };
    expect(check('bucket', bucket, [act('chip_placed', { chip_id: 'c1', bucket_id: 'padding' }), act('chip_placed', { chip_id: 'c2', bucket_id: 'padding' }), act('gate_opened', { chips: 2 })])).toBe('trace_rejected');
    expect(check('bucket', bucket, [act('chip_placed', { chip_id: 'c1', bucket_id: 'padding' }), act('chip_placed', { chip_id: 'c2', bucket_id: 'margin' }), act('gate_opened', { chips: 2 })])).toBeNull();
    expect(check('plug', {}, [act('cable_toggled', { connected: false }), act('cable_toggled', { connected: true }), act('gate_opened', { cable: 'style.css' })])).toBeNull();
    expect(check('plug', {}, [act('gate_opened', { cable: 'style.css' })])).toBe('trace_rejected');
    expect(check('timeline', { steps: [{}, {}, {}] }, [act('step_visited', { index: 1 }), act('step_visited', { index: 2 }), act('gate_opened', { steps: 3 })])).toBeNull();
    expect(check('timeline', { steps: [{}, {}, {}] }, [act('gate_opened', { steps: 3 })])).toBe('trace_rejected');
    expect(check('selector', {}, [act('option_picked', { option: '.menu' }), act('gate_opened', { option: '.menu' })])).toBeNull();
  });

  it('reads the source of an editor the browser grades', () => {
    const spec = {
      language: 'html',
      starter: { pt: '<p>Oi</p>', en: '<p>Hi</p>' },
      checks: [
        { id: 'has', selector: 'p.destaque', assert: { type: 'exists' } },
        { id: 'color', selector: 'p', assert: { type: 'style', property: 'color', equals: 'red' } },
      ],
    };
    expect(check('code_editor_checks', spec, null, null)).toBe('trace_required');
    expect(check('code_editor_checks', spec, null, '<p>Hi</p>')).toBe('trace_rejected');
    expect(check('code_editor_checks', spec, null, '<p>Oi!</p>')).toBe('trace_rejected');
    expect(check('code_editor_checks', spec, null, '<p class="destaque" style="color:red">Oi</p>')).toBeNull();
  });

  it('records the kinds it cannot read as claimed', () => {
    expect(check('terminal_sandbox', {}, null)).toBeNull();
  });
});

describe('readTrace', () => {
  it('reads only a list of timed actions', () => {
    expect(readTrace('gate_opened')).toBeNull();
    expect(readTrace([{ type: 'gate_opened', at: 'now' }])).toBeNull();
    expect(readTrace(Array.from({ length: 501 }, () => ({ type: 'x', at: 1 })))).toBeNull();
    expect(readTrace([{ type: 'gate_opened', at: 5, payload: { found: 2 } }])).toEqual([{ type: 'gate_opened', at: 5, payload: { found: 2 } }]);
  });
});
