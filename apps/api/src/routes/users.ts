import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

const userCreateSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
  isActive: z.boolean().default(true)
});

const userUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional()
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
} as const;

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    });
    res.json(users);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = userCreateSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new HttpError(409, "E-mail ja cadastrado.");

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 12),
        isActive: data.isActive
      },
      select: userSelect
    });
    await recordAudit(req, { entity: "User", entityId: user.id, action: "create", after: user });
    res.status(201).json(user);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = userUpdateSchema.parse(req.body);
    if (data.isActive === false && req.user?.id === req.params.id) {
      throw new HttpError(400, "Nao e possivel desativar o proprio usuario.");
    }

    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
    if (!before) throw new HttpError(404, "Usuario nao encontrado.");

    if (data.email && data.email !== before.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) throw new HttpError(409, "E-mail ja cadastrado.");
    }

    const user = await prisma.user.update({
      where: { id: before.id },
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.password ? await bcrypt.hash(data.password, 12) : undefined,
        isActive: data.isActive
      },
      select: userSelect
    });
    await recordAudit(req, { entity: "User", entityId: user.id, action: "update", before, after: user });
    res.json(user);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.user?.id === req.params.id) {
      throw new HttpError(400, "Nao e possivel desativar o proprio usuario.");
    }
    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
    if (!before) throw new HttpError(404, "Usuario nao encontrado.");
    const user = await prisma.user.update({
      where: { id: before.id },
      data: { isActive: false },
      select: userSelect
    });
    await recordAudit(req, { entity: "User", entityId: user.id, action: "delete", before, after: user });
    res.status(204).end();
  })
);

export default router;
