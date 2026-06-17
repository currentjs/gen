import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture } from '../helpers.js';
import { PortGenerator } from '../../src/generators/portGenerator.js';

const portGen = new PortGenerator();

describe('PortGenerator - export ports', () => {
  const config = loadFixture('quiz-export.yaml');
  const ports = portGen.generateExportPorts(config, 'numeric');

  it('generates one port file per exported query', () => {
    const keys = Object.keys(ports);
    expect(keys.join(',')).toContain('GetQuizStatsInterface');
    expect(keys.join(',')).toContain('ListActiveQuizzesInterface');
  });

  describe('getQuizStats port (identifier-based)', () => {
    const code = ports['GetQuizStatsInterface'] ?? '';

    it('contains GetQuizStatsInput class', () => {
      expect(code).toContain('export class GetQuizStatsInput');
    });

    it('Input has id field (identifier)', () => {
      expect(code).toContain('readonly id:');
    });

    it('Input.parse validates presence of id', () => {
      expect(code).toContain("throw new Error('id is required')");
    });

    it('contains GetQuizStatsOutput class', () => {
      expect(code).toContain('export class GetQuizStatsOutput');
    });

    it('Output has picked fields: title, totalQuestions, averageScore, passRate', () => {
      expect(code).toContain('readonly title:');
      expect(code).toContain('readonly totalQuestions:');
      expect(code).toContain('readonly averageScore:');
    });

    it('Output.from maps from Quiz entity', () => {
      expect(code).toContain('static from(entity: Quiz)');
    });

    it('imports Quiz domain entity', () => {
      expect(code).toContain("import { Quiz } from '../../domain/entities/Quiz'");
    });

    it('contains IGetQuizStatsQuery interface', () => {
      expect(code).toContain('export interface IGetQuizStatsQuery');
    });

    it('interface has execute(input, output) signature', () => {
      expect(code).toContain('execute(input: GetQuizStatsInput): Promise<GetQuizStatsOutput>');
    });
  });

  describe('listActiveQuizzes port (pagination-based)', () => {
    const code = ports['ListActiveQuizzesInterface'] ?? '';

    it('contains ListActiveQuizzesInput with page and limit', () => {
      expect(code).toContain('export class ListActiveQuizzesInput');
      expect(code).toContain('readonly page: number');
      expect(code).toContain('readonly limit: number');
    });

    it('contains IListActiveQuizzesQuery interface', () => {
      expect(code).toContain('export interface IListActiveQuizzesQuery');
      expect(code).toContain('execute(input: ListActiveQuizzesInput): Promise<ListActiveQuizzesOutput>');
    });

    it('generates paginated Output with items and total', () => {
      expect(code).toContain('export class ListActiveQuizzesOutputItem');
      expect(code).toContain('export class ListActiveQuizzesOutput');
      expect(code).toContain('readonly items: ListActiveQuizzesOutputItem[]');
      expect(code).toContain('readonly total: number');
    });
  });
});

describe('PortGenerator - dependency re-export ports', () => {
  const config = loadFixture('dashboard-consumer.yaml');

  it('generateDependencyPorts returns empty when appConfig has no matching module', () => {
    const ports = portGen.generateDependencyPorts(config, '/fake/module', {
      modules: {}
    });
    expect(Object.keys(ports).join('')).toNotContain('Interface');
  });

  it('generateDependencyPorts generates re-export file when exporter is found', () => {
    const ports = portGen.generateDependencyPorts(config, '/app/src/modules/Dashboard', {
      modules: {
        Quiz: { path: '/app/src/modules/Quiz/quiz.yaml' }
      }
    });

    const code = ports['GetQuizStatsInterface'] ?? '';
    expect(code).toContain('export {');
    expect(code).toContain('IGetQuizStatsQuery');
    expect(code).toContain('GetQuizStatsInput');
    expect(code).toContain('GetQuizStatsOutput');
    expect(code).toContain('GetQuizStatsInterface');
  });

  it('re-export path is relative (starts with ..)', () => {
    const ports = portGen.generateDependencyPorts(config, '/app/src/modules/Dashboard', {
      modules: {
        Quiz: { path: '/app/src/modules/Quiz/quiz.yaml' }
      }
    });
    const code = ports['GetQuizStatsInterface'] ?? '';
    expect(code).toContain("from '../");
  });
});

describe('PortGenerator - module with no exports or dependencies', () => {
  it('generateExportPorts returns empty object when exports.queries is empty', () => {
    const config = loadFixture('invoice.yaml');
    const ports = portGen.generateExportPorts(config, 'numeric');
    expect(Object.keys(ports).join('')).toNotContain('Interface');
  });
});
