import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['+251 911 234 567', '+251911234567'],
    ['0911234567', '+251911234567'],
    ['251711234567', '+251711234567'],
    ['911-234-567', '+251911234567'],
  ])('%s → %s', (i, o) => expect(normalizePhone(i)).toBe(o));

  it.each(['+251811234567', '12345', '+1 202 555 0100', ''])('rejects %s', (i) => expect(normalizePhone(i)).toBeNull());
});
