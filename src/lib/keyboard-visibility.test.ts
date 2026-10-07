import { describe, expect, it } from 'vitest';
import { isEditableField, isPinchZoomed, keyboardInset, scrollDelta, scrollPlan } from './keyboard-visibility';

describe('keyboardInset', () => {
  it('is the part of the layout viewport the visual viewport lost', () => {
    expect(keyboardInset(844, 508, 0)).toBe(336);
  });
  it('is zero when the keyboard shrank the layout viewport itself', () => {
    expect(keyboardInset(508, 508, 0)).toBe(0);
  });
  it('counts the pan: a visual viewport moved down hides less of the bottom', () => {
    expect(keyboardInset(844, 508, 100)).toBe(236);
  });
  it('never goes negative', () => {
    expect(keyboardInset(600, 640, 0)).toBe(0);
  });
});

describe('scrollPlan', () => {
  const visible = { top: 0, bottom: 508 };
  it('leaves a field that is inside alone, even close to the edge', () => {
    expect(scrollPlan({ top: 200, bottom: 240 }, visible)).toBe('none');
    expect(scrollPlan({ top: 2, bottom: 506 }, visible)).toBe('none');
  });
  it('leaves a field alone when the browser already panned it into view', () => {
    expect(scrollPlan({ top: 700, bottom: 830 }, { top: 336, bottom: 844 })).toBe('none');
  });
  it('centers a field under the keyboard', () => {
    expect(scrollPlan({ top: 708, bottom: 838 }, visible)).toBe('center');
  });
  it('centers a field that sticks out by a few pixels', () => {
    expect(scrollPlan({ top: 400, bottom: 515 }, visible)).toBe('center');
  });
  it('centers a field cut by the top edge', () => {
    expect(scrollPlan({ top: -4, bottom: 40 }, visible)).toBe('center');
  });
  it('aligns the top of a field taller than the visible area', () => {
    expect(scrollPlan({ top: 240, bottom: 700 }, { top: 0, bottom: 380 })).toBe('start');
  });
});

describe('isPinchZoomed', () => {
  it('is false at scale 1 and within the tolerance', () => {
    expect(isPinchZoomed(1)).toBe(false);
    expect(isPinchZoomed(1.004)).toBe(false);
  });
  it('is true when zoomed in or out', () => {
    expect(isPinchZoomed(2)).toBe(true);
    expect(isPinchZoomed(0.8)).toBe(true);
  });
});

describe('scrollDelta', () => {
  it('moves the middle of the field to the middle of the visible area', () => {
    expect(scrollDelta({ top: 240, bottom: 418 }, { top: 0, bottom: 380 }, 'center')).toBe(139);
  });
  it('moves the top of a tall field just under the top edge', () => {
    expect(scrollDelta({ top: 240, bottom: 700 }, { top: 0, bottom: 380 }, 'start')).toBe(224);
  });
  it('does not move a field that is already fine', () => {
    expect(scrollDelta({ top: 100, bottom: 140 }, { top: 0, bottom: 380 }, 'none')).toBe(0);
  });
});

describe('isEditableField', () => {
  const make = (html: string) => {
    document.body.innerHTML = html;
    return document.body.firstElementChild;
  };
  it('accepts text inputs and textareas', () => {
    expect(isEditableField(make('<input type="email">'))).toBe(true);
    expect(isEditableField(make('<input>'))).toBe(true);
    expect(isEditableField(make('<textarea></textarea>'))).toBe(true);
  });
  it('refuses controls that raise no keyboard', () => {
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'range']) {
      expect(isEditableField(make(`<input type="${type}">`))).toBe(false);
    }
    expect(isEditableField(make('<button></button>'))).toBe(false);
    expect(isEditableField(make('<input readonly>'))).toBe(false);
    expect(isEditableField(make('<textarea disabled></textarea>'))).toBe(false);
  });
  it('refuses nothing and non-elements', () => {
    expect(isEditableField(null)).toBe(false);
  });
});
