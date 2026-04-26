import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

export const validate = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Validation failed",
      issues: result.error.issues.map(i => ({ field: i.path.join("."), message: i.message })),
    });
    return;
  }
  req.body = result.data;
  next();
};

// ── Schemas ────────────────────────────────────────────────────────────────

export const ReportIncidentSchema = z.object({
  type: z.enum(["FLOOD","FIRE","EARTHQUAKE","CYCLONE","LANDSLIDE","CHEMICAL","UNKNOWN"]),
  latitude:     z.number().min(-90).max(90),
  longitude:    z.number().min(-180).max(180),
  originNodeId: z.string().min(1),
  gpsValid:     z.boolean().optional().default(false),
  description:  z.string().max(1000).optional(),
});

export const AddReportSchema = z.object({
  gpsValid:  z.boolean().optional().default(false),
  latitude:  z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  sensorData: z.object({
    accelerometerSpike: z.boolean().optional(),
    soundLevel:         z.number().min(0).max(200).optional(),
    pressureDrop:       z.boolean().optional(),
  }).optional(),
});

export const LoginSchema = z.object({
  email:    z.string().email("Invalid email"),
  password: z.string().min(6, "Password too short"),
});

export const BlockEdgeSchema = z.object({
  reason: z.string().max(200).optional(),
});

export const OverridePlanSchema = z.object({
  reason: z.string().min(1, "Override reason required").max(500),
});