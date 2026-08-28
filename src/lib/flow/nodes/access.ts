import type { ObjectiveResolve } from '../types';

export const ACCESS_NODE_CATEGORY = 'access' as const;
export type AccessNodeType = typeof ACCESS_NODE_CATEGORY;

export const ACCESS_NODE_DEFAULT_NAME = 'Access';
export const ACCESS_NODE_RESOLVE: ObjectiveResolve = {
  subskill: 'hack',
  dcModifier: -2,
  successesRequired: 1,
};