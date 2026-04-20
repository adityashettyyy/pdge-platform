import rateLimit from "express-rate-limit";

// Login: 10 attempts per 15 minutes per IP — prevents credential stuffing
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Report submission: 20 per hour per IP — prevents fake report flooding
// A real user submitting 20 legitimate reports per hour is already extreme
export const reportLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  message: { error: "Report rate limit exceeded. Maximum 20 reports per hour." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key by IP + orgId to prevent cross-org pollution
    const orgId = (req as any).user?.organizationId ?? "anon";
    return `${req.ip}:${orgId}`;
  },
});

// Sitrep generation: 30 per hour — Claude API cost control
export const sitrepLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  message: { error: "Sitrep generation rate limit exceeded." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Plan approval: 50 per hour — soft guard
export const approvalLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 50,
  message: { error: "Approval rate limit exceeded." },
  standardHeaders: true,
  legacyHeaders: false,
});