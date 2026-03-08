// src/middleware/auth.ts

import { Request, Response, NextFunction } from 'express'

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {

  // In production this will verify JWT
  // For now we attach a fake organizationId for development

  ;(req as any).organizationId = 'test-org'

  next()
}

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {

    // In production this checks JWT role
    // For now allow everything

    next()
  }
}