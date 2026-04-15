import type { NextFunction, Request, Response } from 'express';

export function requireRole(roles: string | string[]) {
  const required = Array.isArray(roles) ? roles : [roles];

  const authorize = (req: Request, res: Response): boolean => {
    const identity = req.sentinelIdentity;
    if (!identity) {
      res.status(401).json({ error: 'unauthenticated', message: 'Azure identity required' });
      return false;
    }

    const userRoles = identity.roles ?? [];
    if (userRoles.length === 0) {
      res.status(403).json({
        error: 'forbidden',
        message: 'No roles present in token for protected operation',
      });
      return false;
    }

    if (!required.some((role) => userRoles.includes(role))) {
      res.status(403).json({ error: 'forbidden', message: 'Insufficient role for this operation' });
      return false;
    }

    return true;
  };

  return (
    handler?: (req: Request, res: Response) => Promise<Response | void> | Response | void
  ) => {
    if (handler) {
      return async (req: Request, res: Response): Promise<Response | void> => {
        if (!authorize(req, res)) {
          return;
        }
        return handler(req, res);
      };
    }

    return (req: Request, res: Response, next: NextFunction): void => {
      if (!authorize(req, res)) {
        return;
      }
      next();
    };
  };
}
