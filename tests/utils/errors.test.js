const { AppError, NotFoundError, ValidationError, UnauthorizedError, ConflictError } = require('../../src/utils/errors');

describe('Error classes', () => {
  test('AppError has correct defaults', () => {
    const err = new AppError('something broke');
    expect(err.message).toBe('something broke');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('AppError');
    expect(err instanceof Error).toBe(true);
  });

  test('AppError accepts custom status code', () => {
    const err = new AppError('teapot', 418);
    expect(err.statusCode).toBe(418);
  });

  test('NotFoundError defaults to 404', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err instanceof AppError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  test('NotFoundError accepts custom message', () => {
    const err = new NotFoundError('Project not found');
    expect(err.message).toBe('Project not found');
    expect(err.statusCode).toBe(404);
  });

  test('ValidationError defaults to 400', () => {
    const err = new ValidationError();
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Validation failed');
  });

  test('UnauthorizedError defaults to 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  test('ConflictError defaults to 409', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
  });

  test('Errors can be caught as AppError', () => {
    const errors = [
      new NotFoundError(),
      new ValidationError(),
      new UnauthorizedError(),
      new ConflictError(),
    ];

    errors.forEach(err => {
      expect(err instanceof AppError).toBe(true);
    });
  });

  test('Error names match their class', () => {
    expect(new NotFoundError().name).toBe('NotFoundError');
    expect(new ValidationError().name).toBe('ValidationError');
    expect(new UnauthorizedError().name).toBe('UnauthorizedError');
    expect(new ConflictError().name).toBe('ConflictError');
  });
});
