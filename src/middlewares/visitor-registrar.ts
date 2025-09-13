import { Request, Response, NextFunction, CookieOptions } from 'express';
import db from '@/lib/db';

export const BROWSER_COOKIE_NAME = 'browser'; // To distinguish browsers from SSR
export const VISITOR_COOKIE_NAME = 'visitor';

const cookieOptions: CookieOptions = {
  maxAge: 365 * 24 * 60 * 60 * 1000,
  partitioned: true,
  sameSite: 'none',
  httpOnly: true,
  secure: true,
};

export async function visitorsRegistrar(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (typeof req.cookies !== 'object') {
    throw Error('`cookie-parser` must be used before `visitorRegistrar`');
  }

  // Set visitor cookie, if not exist, on a browser-only, non-auth GET request
  if (req.method === 'GET' && !req.originalUrl.split('/').includes('auth')) {
    if (
      BROWSER_COOKIE_NAME in req.cookies &&
      !(VISITOR_COOKIE_NAME in req.cookies)
    ) {
      res.cookie(VISITOR_COOKIE_NAME, '1', cookieOptions);
      await db.visitor.create({});
    }
  }

  // Set/Refresh browser cookie
  res.cookie(BROWSER_COOKIE_NAME, '1', cookieOptions);
  // Refresh visitor cookie, if exist
  if (VISITOR_COOKIE_NAME in req.cookies) {
    res.cookie(VISITOR_COOKIE_NAME, '1', cookieOptions);
  }

  next();
}
