// ambient declaration
// source: https://www.tutorialspoint.com/typescript/typescript_ambients.htm
// Purpose: we extend the existing interface "Request" from the "express" module
// to include custom properties added by our authentication middleware (methods/auth.ts)

// Ambient declarations are not transpiled into JavaScript, but merely used for type checking.

import type { ParsedQs } from "qs";
import type { Request as ExpressRequest } from "express-serve-static-core";

declare global {
  namespace Express {
    interface DecodedToken {
      _id: string;
      username: string;
      role?: string;
      iat?: number;
      exp?: number;
    }

    // GridFS file metadata returned after upload processing
    interface GridFSFileInfo {
      id: string | null;
      filename: string;
      contentType: string;
      length: number;
      uploadDate: Date;
    }

    interface Request {
      token?: DecodedToken; // decoded JWT token (user data without password)
      username?: string;
    }

    interface AuthenticatedRequest<
      P = {},
      ResBody = any,
      ReqBody = any,
      ReqQuery = ParsedQs,
      LocalsObj extends Record<string, any> = Record<string, any>,
    > extends ExpressRequest<P, ResBody, ReqBody, ReqQuery, LocalsObj> {
      token: DecodedToken; // decoded JWT token (user data without password) - REQUIRED
      username: string; // REQUIRED
    }
  }
}

// empty export to avoid this file from being marked as a script instead of a module
export {};
