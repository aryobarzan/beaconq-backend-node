// ambient declaration
// source: https://www.tutorialspoint.com/typescript/typescript_ambients.htm
// Purpose: we extend the existing interface "Request" from the "express" module
// to include custom properties added by our authentication middleware (methods/auth.ts)

// Ambient declarations are not transpiled into JavaScript, but merely used for type checking.
// Important: we cannot use "import" statements, nor "export" statements in this file, otherwise
// it will no longer be treated as an ambient declaration file.

declare namespace Express {
  interface DecodedToken {
    _id: string;
    username: string;
    role?: string;
    iat?: number;
    exp?: number;
  }
  export interface Request {
    token?: DecodedToken; // decoded JWT token (user data without password)
    username?: string;
  }
}
