// src/middleware/auth.ts
// JWT authentication + RBAC middleware.
// Every protected route uses authenticate() first.
// Then requireRole() gates by permission level.

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AuthPayload, Role } from '../types'

const JWT_SECRET = process.env.JWT_SECRET ?? 'CHANGE_THIS_IN_PRODUCTION'

// ── authenticate ───────────────────────────────────────
// Verifies the Bearer token from Authorization header.
// Attaches req.user and req.organizationId for downstream use.
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' })
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload
    req.user           = payload
    req.organizationId = payload.organizationId ?? undefined
    next()
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' })
  }
}

// ── requireRole ────────────────────────────────────────
// Call after authenticate(). Restricts routes to specific roles.
// requireRole(['ADMIN', 'AGENCY_LEAD']) allows both roles.
const ROLE_HIERARCHY: Record<Role, number> = {
  VIEWER:      0,
  OPERATOR:    1,
  AGENCY_LEAD: 2,
  ADMIN:       3,
}

export function requireRole(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Requires role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
      })
    }
    next()
  }
}

// ── generateToken ──────────────────────────────────────
// Used by the auth controller when user logs in
export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
}
