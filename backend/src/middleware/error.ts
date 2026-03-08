// src/middleware/error.ts
// Global error handler — must be registered LAST in app.ts
// Any next(err) call anywhere lands here.

import { Request, Response, NextFunction } from 'express'

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(`[Error] ${req.method} ${req.path}:`, err.message)

  // Prisma errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any
    if (prismaErr.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Record not found' })
    }
    if (prismaErr.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Record already exists' })
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, error: err.message })
  }

  // Default 500
  const status = (err as any).status ?? 500
  return res.status(status).json({
    success: false,
    error:   process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  })
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` })
}
