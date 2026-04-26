import { Request, Response, NextFunction, RequestHandler } from "express";
export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err.message);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal server error" });
};

export const asyncHandler = (fn: (req: any, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => fn(req, res, next).catch(next);