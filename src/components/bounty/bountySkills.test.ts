import { describe, expect, it } from 'vitest';
import { missionSkills, skillPreview, skillState } from './bountySkills';

const css = (minDays: number) => ({ program: 'itera-v2', trail: 'Week 2 · CSS', minDays });

describe('missionSkills', () => {
  it('lists what days 1..minDays of the trail prove, in order, with a short label and the full claim', () => {
    const skills = missionSkills(css(2), 'en');
    expect(skills?.map((skill) => skill.id)).toEqual(['css-rules', 'css-selectors', 'css-box', 'css-sizing']);
    expect(skills?.map((skill) => skill.day)).toEqual([1, 1, 2, 2]);
    expect(skills?.[2]).toMatchObject({ title: 'Box model', hint: 'Controls space with padding, border and margin' });
  });

  it('finds the trail by its title in either language and answers in the locale asked', () => {
    const skills = missionSkills({ program: 'itera-v2', trail: 'Semana 1 · HTML', minDays: 1 }, 'pt');
    expect(skills?.map((skill) => skill.title)).toEqual(['Tags', 'Esqueleto']);
    expect(skills?.[1].hint).toBe('Escreve do zero o esqueleto válido de uma página');
  });

  it('stops at the last day of the trail', () => {
    expect(missionSkills(css(60), 'en')).toHaveLength(9);
  });

  it('answers null for a program or a trail outside the graph, and for a requirement with no day', () => {
    expect(missionSkills({ program: 'other', trail: 'Week 2 · CSS', minDays: 2 }, 'en')).toBeNull();
    expect(missionSkills({ program: null, trail: 'Week 2 · CSS', minDays: 2 }, 'en')).toBeNull();
    expect(missionSkills({ program: 'itera-v2', trail: 'Week 9 · Rust', minDays: 2 }, 'en')).toBeNull();
    expect(missionSkills({ program: 'itera-v2', trail: undefined, minDays: 2 }, 'en')).toBeNull();
    expect(missionSkills(css(0), 'en')).toBeNull();
  });
});

describe('skillState', () => {
  it('lights the days the gate counted and locks the rest', () => {
    expect(skillState({ day: 1 }, 1)).toBe('lit');
    expect(skillState({ day: 2 }, 1)).toBe('locked');
    expect(skillState({ day: 1 }, 0)).toBe('locked');
  });

  it('is neutral when nobody is being judged', () => {
    expect(skillState({ day: 1 }, null)).toBe('neutral');
  });
});

describe('skillPreview', () => {
  it('keeps the latest days and counts the rest', () => {
    const skills = missionSkills(css(3), 'en') ?? [];
    const { shown, more } = skillPreview(skills, 3);
    expect(shown.map((skill) => skill.id)).toEqual(['css-sizing', 'css-flex-row', 'css-flex-align']);
    expect(more).toBe(3);
  });

  it('shows all of a short list', () => {
    const skills = missionSkills(css(1), 'en') ?? [];
    expect(skillPreview(skills, 3)).toEqual({ shown: skills, more: 0 });
  });
});
