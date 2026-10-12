import { Braces, CodeXml, Lock, Palette, Sparkles } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { skillFamily, skillIcon } from './skillIcon';

describe('skillFamily', () => {
  it('reads the family from the claim id prefix', () => {
    expect(skillFamily('html-tags')).toBe('html');
    expect(skillFamily('css-flex-row')).toBe('css');
    expect(skillFamily('js-dom-write')).toBe('js');
  });

  it('answers other for an id it does not know', () => {
    expect(skillFamily('python-loops')).toBe('other');
    expect(skillFamily('')).toBe('other');
    expect(skillFamily('htmlx-tags')).toBe('other');
  });
});

describe('skillIcon', () => {
  it('picks one icon per family', () => {
    expect(skillIcon('html-tags')).toBe(CodeXml);
    expect(skillIcon('css-box', 'lit')).toBe(Palette);
    expect(skillIcon('js-app', 'neutral')).toBe(Braces);
    expect(skillIcon('rust-traits')).toBe(Sparkles);
  });

  it('shows the padlock for a locked skill of any family', () => {
    expect(skillIcon('html-tags', 'locked')).toBe(Lock);
    expect(skillIcon('rust-traits', 'locked')).toBe(Lock);
  });
});
