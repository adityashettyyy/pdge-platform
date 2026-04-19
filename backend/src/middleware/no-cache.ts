import { Request, Response, NextFunction } from "express";
// Prevents 304 Not Modified on API responses — all API data is dynamic
export const noCache = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
};