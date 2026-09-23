import { isPublicError } from "@live-state/sync";
import type { Request, RequestHandler, Response } from "express";

import {
  mintApiConnectionToken,
  resolveHttpApiCredential,
} from "../lib/api-credential";
import { errors, toErrorResponse } from "../lib/errors";

/**
 * Trade an HTTP credential for a one-time WebSocket token, so API keys and
 * widget JWTs never reach a connection URL. See docs/adr/0016.
 */
export const exchangeConnectionToken: RequestHandler = (req, res) => {
  void handleExchange(req, res);
};

const handleExchange = async (req: Request, res: Response): Promise<void> => {
  try {
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([name, value]) => [
        name,
        Array.isArray(value) ? value[0] : value,
      ])
    );
    const credential = await resolveHttpApiCredential(headers);

    if (!credential) {
      throw errors.unauthorized();
    }

    res.json(await mintApiConnectionToken(credential));
  } catch (error) {
    if (!isPublicError(error)) {
      console.error("connection_token.mint_failed", error);
    }

    const { body, status } = toErrorResponse(error);
    res.status(status).json(body);
  }
};
