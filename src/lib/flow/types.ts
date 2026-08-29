/**
 * Flowchart data model (nodes, edges, maps).
 * Used by both Build mode (edit) and Game mode (play).
 */

export type { NodeCategory } from './nodes';
export type { CountermeasureType } from './countermeasures';
export type { ModuleType } from './modules';
import type { NodeCategory } from './nodes';
import type { CountermeasureType } from './countermeasures';
import type { ModuleType } from './modules';
import {
  ACCESS_NODE_CATEGORY,
  ACCESS_NODE_DEFAULT_NAME,
  ACCESS_NODE_RESOLVE,
  COUNTERMEASURE_NODE_CATEGORY,
  COUNTERMEASURE_NODE_DEFAULT_NAME,
  MODULE_NODE_CATEGORY,
  MODULE_NODE_DEFAULT_NAME,
} from './nodes';
import { WIPE_COUNTERMEASURE } from './countermeasures';
import { BASIC_MODULE } from './modules';

export type Subskill = 'deceive' | 'hack' | 'process';

export type ObjectiveResolve = {
  /** Which subskill is rolled for Resolve checks against this objective. */
  subskill: Subskill;
  /** Optional fixed DC replacing the map-tier default. */
  dcOverride?: number;
  /** DC modifier added to the node's base DC for this check. */
  dcModifier?: number;
  /** How many successes are needed to defeat the objective. */
  successesRequired: number;
};

export interface FlowNode {
  id: string;
  /** Display name (e.g. "Login Server"). */
  name: string;
  /** Position on the grid (pixels, snapped to 80px grid). */
  x: number;
  y: number;
  /** Category drives which checks are required. */
  category: NodeCategory;
  /** Module variant, when this is a module node. */
  moduleType?: ModuleType;
  /** Optional known password that can resolve this node without a hack roll. */
  password?: string;
  /** Security-module bonus applied to all DCs until this module is collected. */
  security?: number;
  /** Marks the win-condition node. Exactly one per map. */
  isRootAccess?: boolean;
  /** Resolve entry for access/countermeasure nodes. */
  resolve?: ObjectiveResolve;
  /** Countdown for countermeasure nodes (e.g. Wipe = 3 phases). */
  countdown?: number;
  /** Variant used to identify the countermeasure's eventual gameplay effect. */
  countermeasureType?: CountermeasureType;
  /** Official rank for Shock Grid countermeasures (1-5). */
  countermeasureRank?: number;
  /** Optional DC a hacking roll must meet to reveal this countermeasure. */
  visibilityDC?: number;
  /** Explicit nodes affected by this countermeasure, independent of graph edges. */
  targetNodeIds?: string[];
  /** Optional flavor text shown when the node is tapped. */
  description?: string;
}

export interface FlowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface FlowMap {
  id: string;
  name: string;
  /** Encounter tier for the overall map. */
  tier: number;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** ISO date string of last save. */
  updatedAt: string;
  /** True if bundled with the app (cannot be deleted). */
  builtIn?: boolean;
  /** 'basic' uses Total Mod for all checks; 'dynamic' uses specific sub-skills. */
  hackingMode?: 'basic' | 'dynamic';
  /** Map-wide failed-attempt threshold for Lockout; defaults to 3 when absent. */
  cumulativeFailureLimit?: number;
}

/** Default node factory used by Build mode. */
export function createNode(partial: Partial<FlowNode> & Pick<FlowNode, 'id' | 'x' | 'y'>): FlowNode {
  const category: NodeCategory = partial.category ?? 'module';
  const resolve = partial.resolve ?? defaultResolveFor(category);
  return {
    id: partial.id,
    name: partial.name ?? defaultNameFor(category),
    x: partial.x,
    y: partial.y,
    category,
    moduleType: partial.moduleType ?? (category === MODULE_NODE_CATEGORY ? BASIC_MODULE : undefined),
    password: partial.password,
    security: partial.security,
    isRootAccess: partial.isRootAccess,
    resolve,
    countdown: partial.countdown,
    countermeasureType: partial.countermeasureType ?? (category === COUNTERMEASURE_NODE_CATEGORY ? WIPE_COUNTERMEASURE : undefined),
    countermeasureRank: partial.countermeasureRank,
    visibilityDC: partial.visibilityDC,
    targetNodeIds: partial.targetNodeIds,
    description: partial.description,
  };
}

function defaultResolveFor(category: NodeCategory): ObjectiveResolve | undefined {
  switch (category) {
    case MODULE_NODE_CATEGORY:
      return undefined;
    case COUNTERMEASURE_NODE_CATEGORY:
      return { subskill: 'hack', dcModifier: 0, successesRequired: 1 };
    case ACCESS_NODE_CATEGORY:
      return ACCESS_NODE_RESOLVE;
  }
}

function defaultNameFor(category: NodeCategory): string {
  switch (category) {
    case MODULE_NODE_CATEGORY:
      return MODULE_NODE_DEFAULT_NAME;
    case COUNTERMEASURE_NODE_CATEGORY:
      return COUNTERMEASURE_NODE_DEFAULT_NAME;
    case ACCESS_NODE_CATEGORY:
      return ACCESS_NODE_DEFAULT_NAME;
  }
}