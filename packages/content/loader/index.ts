/**
 * The build-time loader entry point.
 *
 * A SEPARATE export from `schema/index.ts` on purpose. This module pulls in `yaml` and
 * `node:fs`, neither of which belongs in a device bundle — so the package's main entry does
 * not re-export it, and anything that wants to parse YAML has to say so by importing
 * `@odyssey/content/loader`. Today that is `packages/tools` and nothing else.
 */
export { findEventFiles, loadEvents, type LoadResult } from './load-events.ts';
export {
  declaredIds,
  loadDeclarations,
  loadModifiers,
  type Declarations,
  type LoadDeclarationsResult,
} from './load-declarations.ts';
export { formatIssue, issueAt, locate, offsetToLineCol, type ContentIssue } from './locate.ts';
