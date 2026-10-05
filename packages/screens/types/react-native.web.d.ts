/**
 * The React Native surface a universal screen uses, as the WEB typecheck sees it.
 *
 * The root install has no `react-native` (PLAN ADR-1: the shell keeps its own install), and
 * react-native-web ships no types. The root `tsc` resolves `react-native` to this file
 * (`paths` in `tsconfig.app.json` and in `packages/screens/tsconfig.json`).
 *
 * It is a lower bound, not the authority: `apps/mobile` typechecks the same screens against the
 * real `react-native` and `uniwind/types`. A prop that exists here and not there fails the shell
 * job; one that exists there and not here fails the web job until it is added on purpose.
 * Keep it to what a screen in `src/` imports.
 */
import type { ComponentType, ReactNode } from 'react';

export type Role = 'heading' | 'link';

interface PrimitiveProps {
  children?: ReactNode;
  className?: string;
  role?: Role;
}

export type ViewProps = PrimitiveProps;

export interface TextProps extends PrimitiveProps {
  'aria-level'?: number;
  onPress?: () => void;
}

export const View: ComponentType<ViewProps>;
export const Text: ComponentType<TextProps>;
export const Platform: { readonly OS: 'ios' | 'android' | 'macos' | 'windows' | 'web' };
