// Request body schemas for student routes (NF-03: every input validated on the server).
import { z } from "zod";

export const positionSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(1_000_000),
});

/** What the browser reports when it could not get a position. */
export const positionErrorSchema = z.enum(["denied", "unavailable", "timeout", "unsupported"]);

const token = z.string().min(12).max(64).regex(/^[A-Za-z0-9]+$/);

export const loginBody = z.object({
  token,
  index: z.string().min(1).max(40),
  position: positionSchema.nullish(),
  positionError: positionErrorSchema.nullish(),
  register: z
    .object({
      indexConfirm: z.string().min(1).max(40),
      name: z.string().min(1).max(120),
      classCode: z.string().min(1).max(40),
    })
    .nullish(),
});

export const startBody = z.object({
  activityId: z.uuid(),
  position: positionSchema.nullish(),
  positionError: positionErrorSchema.nullish(),
});

export const submitBody = z.object({
  activityId: z.uuid(),
  ticket: z.string().min(10).max(2000),
  answers: z.unknown(),
  auto: z.boolean().default(false),
  position: positionSchema.nullish(),
  positionError: positionErrorSchema.nullish(),
});

export type LoginBody = z.infer<typeof loginBody>;
