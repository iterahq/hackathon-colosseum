import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearIteraStorage,
  currentStorageScope,
  rememberStorageScope,
  scopedKey,
} from './storageScope';

describe('storageScope', () => {
  beforeEach(() => localStorage.clear());

  it('has no scope until an owner is remembered', () => {
    expect(currentStorageScope()).toBeNull();
    expect(scopedKey('itera.code.snapshot', 'a1')).toBeNull();
  });

  it('namespaces a key by the remembered owner', () => {
    rememberStorageScope('aluno-a');
    expect(scopedKey('itera.code.snapshot', 'a1')).toBe('itera.code.snapshot:aluno-a:a1');
  });

  it('gives two learners different keys for the same activity', () => {
    rememberStorageScope('aluno-a');
    const a = scopedKey('itera.code.snapshot', 'a1');
    rememberStorageScope('aluno-b');
    const b = scopedKey('itera.code.snapshot', 'a1');
    expect(a).not.toBe(b);
  });

  it('survives a reload — the scope is persisted, not in memory', () => {
    rememberStorageScope('aluno-a');
    expect(localStorage.getItem('itera.scope.user')).toBe('aluno-a');
  });

  it('ignores an unresolved owner instead of scoping to nothing', () => {
    rememberStorageScope('aluno-a');
    rememberStorageScope(null);
    expect(currentStorageScope()).toBe('aluno-a');
  });

  it('clears every itera. key, scope pointer included', () => {
    rememberStorageScope('aluno-a');
    localStorage.setItem('itera.code.snapshot:aluno-a:a1', 'x');
    localStorage.setItem('itera.live.answers:aluno-a:s1', 'y');
    localStorage.setItem('itera.locale', 'pt');
    localStorage.setItem('sb-projeto-auth-token', 'keep-me');

    clearIteraStorage();

    expect(currentStorageScope()).toBeNull();
    expect(localStorage.getItem('itera.code.snapshot:aluno-a:a1')).toBeNull();
    expect(localStorage.getItem('itera.live.answers:aluno-a:s1')).toBeNull();
    expect(localStorage.getItem('itera.locale')).toBeNull();
    expect(localStorage.getItem('sb-projeto-auth-token')).toBe('keep-me');
  });

  it('collects the pre-fix unscoped keys too', () => {
    localStorage.setItem('itera.code.snapshot:a1', 'trabalho antigo');
    clearIteraStorage();
    expect(localStorage.getItem('itera.code.snapshot:a1')).toBeNull();
  });
});
