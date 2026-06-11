/**
 * SwarmNoAuthMiddleware
 * Sets req.org to the default organization for no-auth swarm access.
 * Used when DISABLE_REGISTRATION=false and no JWT is provided.
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SwarmNoAuthMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const orgId = process.env.SWARM_ORG_ID || '';
    // @ts-ignore
    req.org = { id: orgId };
    next();
  }
}
