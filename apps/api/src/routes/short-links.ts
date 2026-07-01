import { Router } from "express";
import { hashIp } from "../lib/crypto.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get(
  "/:code",
  asyncHandler(async (req, res) => {
    const shortLink = await prisma.shortLink.findUnique({ where: { code: req.params.code } });
    if (!shortLink) throw new HttpError(404, "Link curto nao encontrado.");

    await prisma.$transaction([
      prisma.shortLink.update({
        where: { id: shortLink.id },
        data: { clickCount: { increment: 1 } }
      }),
      prisma.clickEvent.create({
        data: {
          shortLinkId: shortLink.id,
          offerId: shortLink.offerId,
          userAgent: req.headers["user-agent"],
          referer: req.headers.referer,
          ipHash: hashIp(req.ip)
        }
      })
    ]);

    res.redirect(shortLink.destinationUrl);
  })
);

export default router;
