export function validatePassword(password: string): boolean {
  // Enforce allowed characters: digits, ASCII letters, underscore, ?, !, +, and hyphen (-)
  const allowedPatternRegex = /^[0-9A-Za-z_?!+-]+$/;
  if (password.length < 8 || !allowedPatternRegex.test(password)) {
    return false;
  }
  return true;
}
