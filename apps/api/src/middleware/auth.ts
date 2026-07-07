import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http.js";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: "8h" });
}

export function readBearerToken(header: string | undefined) {
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthUser;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearerToken(req.headers.authorization);

  if (!token) {
    next(new HttpError(401, "Autenticacao obrigatoria."));
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(new HttpError(401, "Sessao expirada ou invalida."));
  }
}
