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
  builtInVersion: 7,
  routeExitAnchorId: 'tut-n5',
  updatedAt: '2026-08-28T12:01:00.000Z',
  nodes: [
    // Single starting access node.
    {
      id: 'tut-n1',
      name: 'User Login',
      x: 80,
      y: 200,
      category: 'access',
      password: 'DATAPAD',
      description: 'Enter the known password to access basic system functions, or hack the entry point to bypass it.',
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
    // Root access is a direct branch from the initial login.
    {
      id: 'tut-root',
      name: 'Root Access',
      x: 400,
      y: 200,
      category: 'access',
      isRootAccess: true,
      resolve: { subskill: 'hack', successesRequired: 1 },
    },
    // Branching fork: a hard countermeasure with a deadline.
    // Base DC 17 with successesRequired: 2.
    {
      id: 'tut-n3',
      name: 'Wipe',
      x: 280,
      y: 360,
      category: 'countermeasure',
      countdown: 2,
      countermeasureType: 'wipe',
      failureLimit: 3,
      targetNodeIds: ['tut-n5'],
      description: 'Wipes downstream nodes after 3 failures or a critical failure',
      resolve: { subskill: 'deceive', successesRequired: 2 },
    },
    // Win condition: clearing Records DB ends the heist.
    {
      id: 'tut-n4',
      name: 'Records DB',
      x: 560,
      y: 200,
      category: 'module',
      resolve: { subskill: 'hack', successesRequired: 1 },
    },
    // Secure Cache module behind the countermeasure.
    {
      id: 'tut-n5',
      name: 'Secure Cache',
      x: 480,
      y: 360,
      category: 'module',
      description: 'Average Secure Data module containing valuable topic-specific information.',
    },
  ],
  edges: [
    { id: 'te1', fromNodeId: 'tut-n1', toNodeId: 'tut-n2' },
    { id: 'te5', fromNodeId: 'tut-n1', toNodeId: 'tut-n6' },
    { id: 'te2', fromNodeId: 'tut-n1', toNodeId: 'tut-root' },
    { id: 'te6', fromNodeId: 'tut-n2', toNodeId: 'tut-n4' },
    { id: 'te3', fromNodeId: 'tut-n2', toNodeId: 'tut-n3' },
    { id: 'te4', fromNodeId: 'tut-n3', toNodeId: 'tut-n5' },
  ],
};

const sampleMapB: FlowMap = {
  id: 'sample-corp-intranet',
  name: 'Corporate Intranet',
  tier: 2,
  description: 'A larger network with branching paths and layered defenses.',
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
      name: 'Intrusion Detection',
      x: 400,
      y: 320,
      category: 'access',
      resolve: { subskill: 'hack', dcModifier: -2, successesRequired: 1 },
    },
    {
      id: 'c5',
      name: 'Firewall',
      x: 560,
      y: 160,
      category: 'countermeasure',
      countermeasureType: 'firewall',
      targetNodeIds: ['c8'],
      description: 'Partitions the file share behind an additional security layer.',
      resolve: { subskill: 'process', dcModifier: 2, successesRequired: 1 },
    },
    {
      id: 'c6',
      name: 'Feedback Virus',
      x: 560,
      y: 320,
      category: 'countermeasure',
      countermeasureType: 'feedback',
      targetNodeIds: ['c9'],
      description: 'Feeds corrupted signals back into the persona on a failed attempt.',
      resolve: { subskill: 'deceive', dcModifier: 1, successesRequired: 1 },
    },
    {
      id: 'c7',
      name: 'Alarm Relay',
      x: 560,
      y: 480,
      category: 'countermeasure',
      countermeasureType: 'alarm',
      targetNodeIds: ['c10'],
      description: 'Alerts the security team when this branch is accessed incorrectly.',
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    {
      id: 'c8',
      name: 'File Share',
      x: 760,
      y: 160,
      category: 'module',
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    {
      id: 'c9',
      name: 'Root Access',
      x: 760,
      y: 320,
      category: 'module',
      isRootAccess: true,
      resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
    },
    {
      id: 'c10',
      name: 'Executive Archive',
      x: 760,
      y: 480,
      category: 'module',
      resolve: { subskill: 'hack', dcModifier: 1, successesRequired: 2 },
      description: 'A high-value module containing the company executive archive.',
    },
  ],
  edges: [
    { id: 'ce1', fromNodeId: 'c1', toNodeId: 'c2' },
    { id: 'ce2', fromNodeId: 'c1', toNodeId: 'c3' },
    { id: 'ce3', fromNodeId: 'c2', toNodeId: 'c4' },
    { id: 'ce4', fromNodeId: 'c3', toNodeId: 'c4' },
    { id: 'ce5', fromNodeId: 'c4', toNodeId: 'c5' },
    { id: 'ce6', fromNodeId: 'c4', toNodeId: 'c6' },
    { id: 'ce7', fromNodeId: 'c4', toNodeId: 'c7' },
    { id: 'ce8', fromNodeId: 'c5', toNodeId: 'c8' },
    { id: 'ce9', fromNodeId: 'c6', toNodeId: 'c9' },
    { id: 'ce10', fromNodeId: 'c7', toNodeId: 'c10' },
  ],
};

export const SAMPLE_MAPS: FlowMap[] = [sampleMapA, sampleMapB];