import type { ObjectiveResolve } from '../types';

export const BASIC_MODULE = 'basic' as const;
export type BasicModuleType = typeof BASIC_MODULE;
export const BASIC_MODULE_RESOLVE: ObjectiveResolve = {
  subskill: 'hack',
  dcModifier: 0,
  successesRequired: 1,
};