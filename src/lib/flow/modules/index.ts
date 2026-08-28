export { BASIC_MODULE, BASIC_MODULE_RESOLVE, type BasicModuleType } from './basic';
export { HARDENED_MODULE, HARDENED_MODULE_RESOLVE, type HardenedModuleType } from './hardened';

import { BASIC_MODULE } from './basic';
import { HARDENED_MODULE } from './hardened';

export type ModuleType = typeof BASIC_MODULE | typeof HARDENED_MODULE;