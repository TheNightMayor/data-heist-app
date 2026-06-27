/**
 * Sample maps bundled with the app. These seed the maps list on first launch
 * and give players something to play immediately without designing first.
 */

import type { FlowMap } from '../lib/flow/types';

const sampleMapA: FlowMap = {
  id: 'sample-datacenter-v2',
  name: 'Datacenter (Tutorial)',
  description: 'A linear spine with one branching fork — learn reachability, planning, aid, and countermeasures.',
  builtIn: true,
  updatedAt: '2026-06-26T00:00:00.000Z',
  nodes: [
    // Single starting gateway.
    {
      id: 'tut-n1',
      name: 'Reception',
      x: 80,
      y: 200,
      category: 'gateway',
      tier: 1,
      resolve: { subskill: 'hack', dcModifier: -2, successesRequired: 1 },
    },
    // Linear spine continues from the start.
    {
      id: 'tut-n2',
      name: 'Auth Server',
      x: 280,
      y: 200,
      category: 'module',
      tier: 2,
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    // Branching fork: a hard countermeasure with a deadline.
    // DC 29 with successesRequired: 2 — needs Plan Turn + Aid to clear.
    {
      id: 'tut-n3',
      name: 'Honeyvault Trap',
      x: 280,
      y: 360,
      category: 'countermeasure',
      tier: 3,
      countdown: 2,
      resolve: { subskill: 'deceive', dcModifier: 4, successesRequired: 2 },
    },
    // Win condition: clearing Records DB ends the heist.
    {
      id: 'tut-n4',
      name: 'Records DB',
      x: 480,
      y: 200,
      category: 'module',
      tier: 3,
      isRootAccess: true,
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    // Reward behind the trap — easy once you clear Honeyvault.
    {
      id: 'tut-n5',
      name: 'Data Cache',
      x: 480,
      y: 360,
      category: 'module',
      tier: 1,
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
  ],
  edges: [
    { id: 'te1', fromNodeId: 'tut-n1', toNodeId: 'tut-n2' },
    { id: 'te2', fromNodeId: 'tut-n2', toNodeId: 'tut-n4' },
    { id: 'te3', fromNodeId: 'tut-n2', toNodeId: 'tut-n3' },
    { id: 'te4', fromNodeId: 'tut-n3', toNodeId: 'tut-n5' },
  ],
};

const sampleMapB: FlowMap = {
  id: 'sample-corp-intranet',
  name: 'Corporate Intranet',
  description: 'A larger network with branching paths and a hazard.',
  builtIn: true,
  updatedAt: '2026-06-26T00:00:00.000Z',
  nodes: [
    {
      id: 'c1',
      name: 'External Endpoint',
      x: 80,
      y: 320,
      category: 'gateway',
      tier: 1,
      resolve: { subskill: 'hack', dcModifier: -2, successesRequired: 1 },
    },
    {
      id: 'c2',
      name: 'Web Proxy',
      x: 240,
      y: 200,
      category: 'module',
      tier: 2,
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    {
      id: 'c3',
      name: 'Mail Server',
      x: 240,
      y: 440,
      category: 'module',
      tier: 1,
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    {
      id: 'c4',
      name: 'IDS (Hazard)',
      x: 400,
      y: 320,
      category: 'gateway',
      tier: 2,
      hazard: true,
      resolve: { subskill: 'hack', dcModifier: -2, successesRequired: 1 },
    },
    {
      id: 'c5',
      name: 'File Share',
      x: 560,
      y: 200,
      category: 'module',
      tier: 2,
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    {
      id: 'c6',
      name: 'Root Access',
      x: 560,
      y: 440,
      category: 'module',
      tier: 3,
      isRootAccess: true,
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
  ],
  edges: [
    { id: 'ce1', fromNodeId: 'c1', toNodeId: 'c2' },
    { id: 'ce2', fromNodeId: 'c1', toNodeId: 'c3' },
    { id: 'ce3', fromNodeId: 'c2', toNodeId: 'c4' },
    { id: 'ce4', fromNodeId: 'c3', toNodeId: 'c4' },
    { id: 'ce5', fromNodeId: 'c4', toNodeId: 'c5' },
    { id: 'ce6', fromNodeId: 'c4', toNodeId: 'c6' },
  ],
};

export const SAMPLE_MAPS: FlowMap[] = [sampleMapA, sampleMapB];