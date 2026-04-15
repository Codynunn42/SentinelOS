import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    const headerName = 'x-request-id';
    let id = req.headers[headerName] as string | undefined;

    if (!id) {
      id = randomUUID();
    }

    // ensure header is present for downstream services
    res.setHeader(headerName, id);

    // attach to res.locals for convenience
    (res.locals as any).request_id = id;

    next();
  };
}
