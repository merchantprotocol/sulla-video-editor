const { ValidationError } = require('../utils/errors');

/**
 * Lightweight request validation middleware.
 * Validates body fields against simple type/constraint rules.
 *
 * Usage:
 *   router.post('/foo', validate({ name: 'string', count: 'number?' }), handler)
 *
 * Types: 'string', 'number', 'boolean', 'object'
 * Append '?' for optional fields.
 * Use 'email' for email format validation.
 * Use 'enum:a,b,c' for allowed values.
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rule] of Object.entries(schema)) {
      const value = req.body[field];
      const optional = rule.endsWith('?');
      const type = optional ? rule.slice(0, -1) : rule;

      if (value === undefined || value === null || value === '') {
        if (!optional) errors.push(`${field} is required`);
        continue;
      }

      if (type === 'email') {
        if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push(`${field} must be a valid email`);
        }
      } else if (type.startsWith('enum:')) {
        const allowed = type.slice(5).split(',');
        if (!allowed.includes(String(value))) {
          errors.push(`${field} must be one of: ${allowed.join(', ')}`);
        }
      } else if (type === 'string') {
        if (typeof value !== 'string') errors.push(`${field} must be a string`);
      } else if (type === 'number') {
        if (typeof value !== 'number' || isNaN(value)) errors.push(`${field} must be a number`);
      } else if (type === 'boolean') {
        if (typeof value !== 'boolean') errors.push(`${field} must be a boolean`);
      } else if (type === 'object') {
        if (typeof value !== 'object') errors.push(`${field} must be an object`);
      }
    }

    if (errors.length > 0) {
      return next(new ValidationError(errors.join('; ')));
    }
    next();
  };
}

module.exports = validate;
