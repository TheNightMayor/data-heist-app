import type { ObjectiveResolve } from '../types';

export const HARDENED_MODULE = 'hardened' as const;
export type HardenedModuleType = typeof HARDENED_MODULE;
export const HARDENED_MODULE_RESOLVE: ObjectiveResolve = {
  subskill: 'hack',
  dcModifier: 0,
  successesRequired: 2,
};