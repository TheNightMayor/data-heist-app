/**
 * Sample maps bundled with the app. These seed the maps list on first launch
 * and give players something to play immediately without designing first.
 */

import type { FlowMap } from '../lib/flow/types';

const sampleMapA: FlowMap = {
  id: 'sample-datacenter-v2',
  name: 'Datapad (Tutorial)',
  tier: 1,
  description: 'Learn about node hacking, countermeasures, and module rewards.',
  builtIn: true,
  updatedAt: '2026-08-23T00:00:00.000Z',
  nodes: [
    // Single starting access node.
    {
      id: 'tut-n1',
      name: 'Access',
      x: 80,
      y: 200,
      category: 'access',
      resolve: { subskill: 'hack', successesRequired: 1 },
    },
    // Linear spine continues from the start.
    {
      id: 'tut-n2',
      name: 'Auth Server',
      x: 280,
      y: 200,
      category: 'access',
      resolve: { subskill: 'hack', successesRequired: 1 },
    },
    // Security module branch: while uncollected, all hacking DCs are +1.
    {
      id: 'tut-n6',
      name: 'Security I',
      x: 180,
      y: 360,
      category: 'module',
      security: 1,
      description: 'Security I module. Collecting it removes its +1 DC bonus from the system.',
    },
    // Branching fork: a hard countermeasure with a deadline.
    // DC 21 with successesRequired: 2.
    {
      id: 'tut-n3',
      name: 'Wipe',
      x: 280,
      y: 360,
      category: 'countermeasure',
      countdown: 2,
      countermeasureType: 'wipe',
      targetNodeIds: ['tut-n5'],
      description: 'Wipes downstream nodes after 3 failures or a critical failure',
      resolve: { subskill: 'deceive', dcModifier: -4, successesRequired: 2 },
    },
    // Win condition: clearing Records DB ends the heist.
    {
      id: 'tut-n4',
      name: 'Records DB',
      x: 480,
      y: 200,
      category: 'module',
      isRootAccess: true,
      resolve: { subskill: 'hack', dcModifier: -6, successesRequired: 1 },
    },
    // Secure Data module behind the countermeasure.
    {
      id: 'tut-n5',
      name: 'Secure Data',
      x: 480,
      y: 360,
      category: 'module',
      description: 'Average Secure Data module containing valuable topic-specific information.',
    },
  ],
  edges: [
    { id: 'te1', fromNodeId: 'tut-n1', toNodeId: 'tut-n2' },
    { id: 'te5', fromNodeId: 'tut-n1', toNodeId: 'tut-n6' },
    { id: 'te2', fromNodeId: 'tut-n2', toNodeId: 'tut-n4' },
    { id: 'te3', fromNodeId: 'tut-n2', toNodeId: 'tut-n3' },
    { id: 'te4', fromNodeId: 'tut-n3', toNodeId: 'tut-n5' },
  ],
};

const sampleMapB: FlowMap = {
  id: 'sample-corp-intranet',
  name: 'Corporate Intranet',
  tier: 2,
  description: 'A larger network with branching paths and a hazard.',
  builtIn: true,
  updatedAt: '2026-06-26T00:00:00.000Z',
  nodes: [
    {
      id: 'c1',
      name: 'External Endpoint',
      x: 80,
      y: 320,
      category: 'access',
      resolve: { subskill: 'hack', dcModifier: -2, successesRequired: 1 },
    },
    {
      id: 'c2',
      name: 'Web Proxy',
      x: 240,
      y: 200,
      category: 'module',
      security: 1,
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    {
      id: 'c3',
      name: 'Mail Server',
      x: 240,
      y: 440,
      category: 'module',
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    {
      id: 'c4',
      name: 'IDS (Hazard)',
      x: 400,
      y: 320,
      category: 'access',
      hazard: true,
      resolve: { subskill: 'hack', dcModifier: -2, successesRequired: 1 },
    },
    {
      id: 'c5',
      name: 'File Share',
      x: 560,
      y: 200,
      category: 'module',
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    {
      id: 'c6',
      name: 'Root Access',
      x: 560,
      y: 440,
      category: 'module',
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