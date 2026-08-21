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

describe('PortGenerator - command export ports', () => {
  const config = loadFixture('notification-command-export.yaml');
  const ports = portGen.generateExportPorts(config, 'numeric');

  it('generates one port file per exported command', () => {
    const keys = Object.keys(ports);
    expect(keys.join(',')).toContain('SendEmailInterface');
    expect(keys.join(',')).toContain('MarkAllReadInterface');
  });

  describe('sendEmail port (void output)', () => {
    const code = ports['SendEmailInterface'] ?? '';

    it('contains SendEmailInput class', () => {
      expect(code).toContain('export class SendEmailInput');
    });

    it('contains void Output type', () => {
      expect(code).toContain('export type SendEmailOutput = void');
    });

    it('contains ISendEmailCommand interface (not ISendEmailQuery)', () => {
      expect(code).toContain('export interface ISendEmailCommand');
      expect(code).toNotContain('ISendEmailQuery');
    });

    it('interface execute() returns Promise<SendEmailOutput>', () => {
      expect(code).toContain('execute(input: SendEmailInput): Promise<SendEmailOutput>');
    });
  });

  describe('markAllRead port (non-void output)', () => {
    const code = ports['MarkAllReadInterface'] ?? '';

    it('contains MarkAllReadOutput class', () => {
      expect(code).toContain('export class MarkAllReadOutput');
    });

    it('contains IMarkAllReadCommand interface', () => {
      expect(code).toContain('export interface IMarkAllReadCommand');
    });

    it('output picks only declared fields (id, sentAt)', () => {
      expect(code).toContain('readonly sentAt');
      expect(code).toNotContain('readonly recipientEmail');
    });
  });
});

describe('PortGenerator - command dependency re-export ports', () => {
  const config = loadFixture('order-command-consumer.yaml');

  it('generateDependencyPorts generates command re-export file when exporter is found', () => {
    const ports = portGen.generateDependencyPorts(config, '/app/src/modules/Order', {
      modules: {
        Notification: { path: '/app/src/modules/Notification/notification.yaml' }
      }
    });

    const code = ports['SendEmailInterface'] ?? '';
    expect(code).toContain('export {');
    expect(code).toContain('ISendEmailCommand');
    expect(code).toContain('SendEmailInput');
    expect(code).toContain('SendEmailOutput');
  });

  it('command re-export uses I*Command (not I*Query)', () => {
    const ports = portGen.generateDependencyPorts(config, '/app/src/modules/Order', {
      modules: {
        Notification: { path: '/app/src/modules/Notification/notification.yaml' }
      }
    });
    const code = ports['SendEmailInterface'] ?? '';
    expect(code).toContain('ISendEmailCommand');
    expect(code).toNotContain('ISendEmailQuery');
  });

  it('re-export path is relative', () => {
    const ports = portGen.generateDependencyPorts(config, '/app/src/modules/Order', {
      modules: {
        Notification: { path: '/app/src/modules/Notification/notification.yaml' }
      }
    });
    const code = ports['SendEmailInterface'] ?? '';
    expect(code).toContain("from '../");
  });
});
