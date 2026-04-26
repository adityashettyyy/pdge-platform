import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";
import { AuthRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/error";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" }); return;
  }
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
    process.env.JWT_SECRET!, { expiresIn: "24h" }
  );
  // Return organizationId so frontend WebSocket can use it
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId } });
});

export const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, organizationId: true },
  });
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(user);
});