import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture } from '../helpers.js';
import { QueryGenerator } from '../../src/generators/queryGenerator.js';

const queryGen = new QueryGenerator();

describe('QueryGenerator - identifier-based query (getQuizStats)', () => {
  const config = loadFixture('quiz-export.yaml');
  const result = queryGen.generateFromConfig(config, 'numeric');
  const code = result['GetQuizStatsQuery'] ?? '';

  it('generates GetQuizStatsQuery class', () => {
    expect(code).toContain('export class GetQuizStatsQuery');
  });

  it('is decorated with @Injectable()', () => {
    expect(code).toContain('@Injectable()');
  });

  it('implements IGetQuizStatsQuery', () => {
    expect(code).toContain('implements IGetQuizStatsQuery');
  });

  it('imports IGetQuizStatsQuery and DTOs from port file', () => {
    expect(code).toContain("import { IGetQuizStatsQuery, GetQuizStatsInput, GetQuizStatsOutput }");
    expect(code).toContain("'../ports/GetQuizStatsInterface'");
  });

  it('imports QuizStore from infrastructure', () => {
    expect(code).toContain("import { QuizStore }");
    expect(code).toContain("'../../infrastructure/stores/QuizStore'");
  });

  it('has quizStore in constructor', () => {
    expect(code).toContain('private quizStore: QuizStore');
  });

  it('execute() uses getById pattern (identifier-based)', () => {
    expect(code).toContain('quizStore.getById(input.id)');
  });

  it('execute() checks for null result and throws not found error', () => {
    expect(code).toContain("throw new Error('Quiz not found')");
  });

  it('execute() returns GetQuizStatsOutput.from(...)', () => {
    expect(code).toContain('GetQuizStatsOutput.from(quiz)');
  });
});

describe('QueryGenerator - pagination-based query (listActiveQuizzes)', () => {
  const config = loadFixture('quiz-export.yaml');
  const result = queryGen.generateFromConfig(config, 'numeric');
  const code = result['ListActiveQuizzesQuery'] ?? '';

  it('generates ListActiveQuizzesQuery class', () => {
    expect(code).toContain('export class ListActiveQuizzesQuery');
  });

  it('implements IListActiveQuizzesQuery', () => {
    expect(code).toContain('implements IListActiveQuizzesQuery');
  });

  it('execute() uses pagination pattern (getPaginated)', () => {
    expect(code).toContain('quizStore.getPaginated(input.page, input.limit)');
  });
});

describe('QueryGenerator - module with no exports', () => {
  const config = loadFixture('invoice.yaml');
  const result = queryGen.generateFromConfig(config, 'numeric');

  it('generates no query classes when exports.queries is absent', () => {
    expect(Object.keys(result).join('')).toNotContain('Query');
  });
});

describe('QueryGenerator - identifier types', () => {
  it('uuid identifiers do not affect query class structure (store still injected)', () => {
    const config = loadFixture('quiz-export.yaml');
    const result = queryGen.generateFromConfig(config, 'uuid');
    const code = result['GetQuizStatsQuery'] ?? '';
    expect(code).toContain('implements IGetQuizStatsQuery');
    expect(code).toContain('quizStore: QuizStore');
  });
});
