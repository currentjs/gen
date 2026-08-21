import { describe, it } from '../lib';
import { expect } from '../lib';
import { loadFixture } from '../helpers';
import { CommandGenerator } from '../../src/generators/commandGenerator';

const commandGen = new CommandGenerator();

describe('CommandGenerator - void output command (sendEmail)', () => {
  const config = loadFixture('notification-command-export.yaml');
  const result = commandGen.generateFromConfig(config, 'numeric');
  const code = result['SendEmailCommand'] ?? '';

  it('generates SendEmailCommand class', () => {
    expect(code).toContain('export class SendEmailCommand');
  });

  it('is decorated with @Injectable()', () => {
    expect(code).toContain('@Injectable()');
  });

  it('implements ISendEmailCommand', () => {
    expect(code).toContain('implements ISendEmailCommand');
  });

  it('imports ISendEmailCommand from port file', () => {
    expect(code).toContain("import { ISendEmailCommand, SendEmailInput }");
    expect(code).toContain("'../ports/SendEmailInterface'");
  });

  it('does NOT import SendEmailOutput for void command', () => {
    expect(code).toNotContain('SendEmailOutput');
  });

  it('imports NotificationService from application services', () => {
    expect(code).toContain("import { NotificationService }");
    expect(code).toContain("'../../application/services/NotificationService'");
  });

  it('has notificationService in constructor', () => {
    expect(code).toContain('private notificationService: NotificationService');
  });

  it('execute() returns Promise<void>', () => {
    expect(code).toContain('Promise<void>');
  });

  it('execute() calls default:create handler', () => {
    expect(code).toContain('notificationService.create(input as any)');
  });

  it('execute() calls dispatch handler passing previous result', () => {
    expect(code).toContain('notificationService.dispatch(result0, input)');
  });

  it('execute() ends with return for void', () => {
    expect(code).toContain('return;');
  });
});

describe('CommandGenerator - non-void output command (markAllRead)', () => {
  const config = loadFixture('notification-command-export.yaml');
  const result = commandGen.generateFromConfig(config, 'numeric');
  const code = result['MarkAllReadCommand'] ?? '';

  it('generates MarkAllReadCommand class', () => {
    expect(code).toContain('export class MarkAllReadCommand');
  });

  it('implements IMarkAllReadCommand', () => {
    expect(code).toContain('implements IMarkAllReadCommand');
  });

  it('imports MarkAllReadOutput for non-void command', () => {
    expect(code).toContain('MarkAllReadOutput');
  });

  it('execute() uses identifier-based get pattern', () => {
    expect(code).toContain('notificationService.get(input.id)');
  });

  it('execute() calls markRead handler passing previous result', () => {
    expect(code).toContain('notificationService.markRead(result0, input)');
  });

  it('execute() returns MarkAllReadOutput.from(result)', () => {
    expect(code).toContain('MarkAllReadOutput.from(result)');
  });
});

describe('CommandGenerator - model fallback to output.from', () => {
  const config = loadFixture('notification-command-export.yaml');
  const result = commandGen.generateFromConfig(config, 'numeric');
  const codeMarkAll = result['MarkAllReadCommand'] ?? '';

  it('uses Notification as model when no explicit model field but output.from is set', () => {
    expect(codeMarkAll).toContain('NotificationService');
  });
});

describe('CommandGenerator - module with no commands', () => {
  const config = loadFixture('quiz-export.yaml');
  const result = commandGen.generateFromConfig(config, 'numeric');

  it('returns empty object when no exports.commands defined', () => {
    const keys = Object.keys(result);
    expect(keys.join(',')).toNotContain('Command');
  });
});
