import { existsSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findWorkspaceRoot } from '../workspace-root.js';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('findWorkspaceRoot', () => {
  it('finds the root from a deeply nested directory', () => {
    const root = findWorkspaceRoot(HERE);
    expect(existsSync(join(root, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('returns the directory itself when it is already the root', () => {
    const root = findWorkspaceRoot(HERE);
    expect(findWorkspaceRoot(root)).toBe(root);
  });

  it('resolves the same root regardless of which subdirectory it starts from', () => {
    const fromHere = findWorkspaceRoot(HERE);
    const fromPackages = findWorkspaceRoot(resolve(fromHere, 'packages'));
    expect(fromPackages).toBe(fromHere);
  });

  it('throws rather than looping forever when there is no workspace above', () => {
    // The filesystem root can never contain pnpm-workspace.yaml in a sane checkout,
    // so this exercises the termination path — the failure mode that would otherwise
    // hang CI instead of failing it.
    const filesystemRoot = parse(HERE).root;
    expect(() => findWorkspaceRoot(filesystemRoot)).toThrow(/pnpm-workspace\.yaml/);
  });
});
