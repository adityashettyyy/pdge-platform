import { Request, Response, NextFunction } from "express";
export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err.message);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal server error" });
};
