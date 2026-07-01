import { sanitizeNoSql, isValidFilename, isAllowedFile } from '@/lib/security-helpers';

describe('Security Helpers', () => {
  describe('NoSQL Injection Sanitizer', () => {
    it('should strip out any fields starting with $', () => {
      const input = {
        username: 'testuser',
        password: { $gt: '' },
        $ne: 'admin'
      };

      const expected = {
        username: 'testuser',
        password: {}
      };

      expect(sanitizeNoSql(input)).toEqual(expected);
    });

    it('should recursively sanitize nested objects and arrays', () => {
      const input = {
        filters: [
          { field: 'name', value: { $regex: '.*' } },
          { field: 'role', value: 'User' }
        ],
        meta: {
          $and: [{ page: 1 }]
        }
      };

      const expected = {
        filters: [
          { field: 'name', value: {} },
          { field: 'role', value: 'User' }
        ],
        meta: {}
      };

      expect(sanitizeNoSql(input)).toEqual(expected);
    });

    it('should return primitive types unmodified', () => {
      expect(sanitizeNoSql('string')).toBe('string');
      expect(sanitizeNoSql(42)).toBe(42);
      expect(sanitizeNoSql(true)).toBe(true);
      expect(sanitizeNoSql(null)).toBe(null);
    });
  });

  describe('Filename Validator', () => {
    it('should allow clean and standard filenames', () => {
      expect(isValidFilename('profile.png')).toBe(true);
      expect(isValidFilename('my-report_2026.pdf')).toBe(true);
    });

    it('should block filenames with directory traversal or slash sequences', () => {
      expect(isValidFilename('../../etc/passwd')).toBe(false);
      expect(isValidFilename('images/avatar.jpg')).toBe(false);
      expect(isValidFilename('C:\\Windows\\system32')).toBe(false);
    });

    it('should block null bytes or illegal characters', () => {
      expect(isValidFilename('file\0.txt')).toBe(false);
      expect(isValidFilename('file*.txt')).toBe(false);
      expect(isValidFilename('file?.txt')).toBe(false);
    });
  });

  describe('Allowed Files Checker', () => {
    it('should allow whitelisted MIMEs and extension combinations', () => {
      expect(isAllowedFile('image/png', 'png')).toBe(true);
      expect(isAllowedFile('application/pdf', 'pdf')).toBe(true);
      expect(isAllowedFile('image/jpeg', '.jpg')).toBe(true);
    });

    it('should block unapproved MIME types or extensions', () => {
      expect(isAllowedFile('application/javascript', 'js')).toBe(false);
      expect(isAllowedFile('text/html', 'html')).toBe(false);
      expect(isAllowedFile('image/png', 'exe')).toBe(false);
    });
  });
});
