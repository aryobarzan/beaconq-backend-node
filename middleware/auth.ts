import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user';
import process from 'process';
import logger from './logger';
import mongoose from 'mongoose';
import { Request, Response, NextFunction } from 'express';

// DecodedToken is defined globally in types/express.d.ts
type DecodedToken = Express.DecodedToken;

// "Response" return type necessary in case of failures, where we return res.status(...).send(...)
// Otherwise, if the authentication is successful, next() is called and nothing is returned (void).

/**
 * Authentication middleware that verifies JWT tokens and attaches
 * the decoded token data to the request object. (AuthenticatedRequest)
 */
export default async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return res.status(401).send({ error: 'Missing or invalid token.' });
    }

    const token = authorizationHeader.split(' ')[1];
    if (!token) {
      return res.status(401).send({ error: 'Missing token.' });
    }

    const publicKey = process.env.PUBLIC_KEY;
    if (!publicKey) {
      logger.error('PUBLIC_KEY environment variable is not set.');
      return res.status(500).send({ error: 'Server configuration error.' });
    }

    const decodedToken = jwt.verify(token, publicKey) as DecodedToken;

    // check if token contains required field
    if (!decodedToken._id) {
      return res.status(401).send({ error: 'Invalid token payload.' });
    }

    const userId = new mongoose.Types.ObjectId(decodedToken._id);
    const user = await UserModel.findById(userId).select('username').lean();

    if (!user) {
      logger.warn(
        `Authentication failed for user id ${userId}. User could not be found in users collection.`
      );
      return res.status(404).send({ error: 'User account does not exist.' });
    }

    // attach verified token and username to request
    req.token = decodedToken;
    req.username = user.username;
    next();
  } catch (err: unknown) {
    if (err instanceof jwt.JsonWebTokenError) {
      logger.warn(`JWT verification failed: ${err.message}`);
      return res.status(401).send({ error: 'Invalid token.' });
    }
    if (err instanceof jwt.TokenExpiredError) {
      logger.warn(`Token expired: ${err.message}`);
      return res.status(401).send({ error: 'Token expired.' });
    }
    logger.error(err);
    return res.status(500).send({ error: 'Authentication error.' });
  }
};
