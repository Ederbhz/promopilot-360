import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { readBearerToken, requireAuth, signToken, verifyToken } from "../middleware/auth.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8)
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const userCount = await prisma.user.count();

    if (userCount > 0) {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        throw new HttpError(401, "Cadastro de usuarios exige sessao administrativa.");
      }
      try {
        req.user = verifyToken(token);
      } catch {
        throw new HttpError(401, "Sessao expirada ou invalida.");
      }
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new HttpError(409, "E-mail ja cadastrado.");
    }

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 12)
      },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });

    await recordAudit(req, {
      entity: "User",
      entityId: user.id,
      action: "create",
      after: user
    });

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.status(201).json({ token, user });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    if (!user || !user.isActive) {
      throw new HttpError(401, "E-mail ou senha invalidos.");
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      throw new HttpError(401, "E-mail ou senha invalidos.");
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  })
);

router.post(
  "/refresh",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });
    if (!user || !user.isActive) {
      throw new HttpError(401, "Sessao expirada ou invalida.");
    }
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.json({ token, user });
  })
);

router.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });
    res.json(user);
  })
);

export default router;
