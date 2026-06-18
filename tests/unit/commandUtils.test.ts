import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { getModuleEntries } from '../../src/utils/commandUtils.js';
import type { AppConfig } from '../../src/utils/commandUtils.js';

describe('getModuleEntries — styling resolution', () => {
  it('defaults to "bootstrap" when no styling is set', () => {
    const config: AppConfig = {
      modules: { Foo: { path: 'src/modules/Foo/foo.yaml' } }
    };
    const entries = getModuleEntries(config);
    expect(entries[0].styling).toContain('bootstrap');
  });

  it('uses "bootstrap" from global config', () => {
    const config: AppConfig = {
      config: { styling: 'bootstrap' },
      modules: { Foo: { path: 'src/modules/Foo/foo.yaml' } }
    };
    const entries = getModuleEntries(config);
    expect(entries[0].styling).toContain('bootstrap');
  });

  it('uses "tailwind" from global config', () => {
    const config: AppConfig = {
      config: { styling: 'tailwind' },
      modules: { Foo: { path: 'src/modules/Foo/foo.yaml' } }
    };
    const entries = getModuleEntries(config);
    expect(entries[0].styling).toContain('tailwind');
  });

  it('per-module styling overrides global config', () => {
    const config: AppConfig = {
      config: { styling: 'bootstrap' },
      modules: {
        Foo: { path: 'src/modules/Foo/foo.yaml', styling: 'tailwind' },
        Bar: { path: 'src/modules/Bar/bar.yaml' }
      }
    };
    const entries = getModuleEntries(config);
    const foo = entries.find(e => e.name === 'Foo')!;
    const bar = entries.find(e => e.name === 'Bar')!;
    expect(foo.styling).toContain('tailwind');
    expect(bar.styling).toContain('bootstrap');
  });

  it('per-module styling can set bootstrap when global is tailwind', () => {
    const config: AppConfig = {
      config: { styling: 'tailwind' },
      modules: {
        Foo: { path: 'src/modules/Foo/foo.yaml', styling: 'bootstrap' }
      }
    };
    const entries = getModuleEntries(config);
    expect(entries[0].styling).toContain('bootstrap');
  });

  it('multiple modules all inherit global tailwind styling', () => {
    const config: AppConfig = {
      config: { styling: 'tailwind' },
      modules: {
        Foo: { path: 'src/modules/Foo/foo.yaml' },
        Bar: { path: 'src/modules/Bar/bar.yaml' },
        Baz: { path: 'src/modules/Baz/baz.yaml' }
      }
    };
    const entries = getModuleEntries(config);
    for (const entry of entries) {
      expect(entry.styling).toContain('tailwind');
    }
  });
});
