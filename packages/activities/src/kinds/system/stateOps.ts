import type { StateLabControlSpec } from '../../specs.js';
import { getPath, setPath } from './viewModel.js';

export type State = Record<string, unknown>;

export function applyControl(state: State, control: StateLabControlSpec, value?: string): State {
  const current = getPath(state, control.path);
  switch (control.type) {
    case 'toggle':
      return setPath(state, control.path, current !== true);
    case 'text':
      return setPath(state, control.path, value ?? '');
    case 'add_item':
      return Array.isArray(current)
        ? setPath(state, control.path, [...current, cloneJson(control.template ?? {})])
        : state;
    case 'remove_item': {
      if (Array.isArray(current)) return setPath(state, control.path, current.slice(0, -1));
      const keys = control.path.split('.');
      const index = Number(keys.pop());
      const parentPath = keys.join('.');
      const parent = getPath(state, parentPath);
      return Array.isArray(parent) && Number.isInteger(index)
        ? setPath(state, parentPath, parent.filter((_, i) => i !== index))
        : state;
    }
    default:
      return state;
  }
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
