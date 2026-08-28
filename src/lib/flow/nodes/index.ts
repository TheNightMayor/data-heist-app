export {
  ACCESS_NODE_CATEGORY,
  ACCESS_NODE_DEFAULT_NAME,
  ACCESS_NODE_RESOLVE,
  type AccessNodeType,
} from './access';
export {
  COUNTERMEASURE_NODE_CATEGORY,
  COUNTERMEASURE_NODE_DEFAULT_NAME,
  type CountermeasureNodeType,
} from './countermeasure';
export {
  MODULE_NODE_CATEGORY,
  MODULE_NODE_DEFAULT_NAME,
  type ModuleNodeType,
} from './module';

import { ACCESS_NODE_CATEGORY } from './access';
import { COUNTERMEASURE_NODE_CATEGORY } from './countermeasure';
import { MODULE_NODE_CATEGORY } from './module';

export type NodeCategory =
  | typeof ACCESS_NODE_CATEGORY
  | typeof COUNTERMEASURE_NODE_CATEGORY
  | typeof MODULE_NODE_CATEGORY;