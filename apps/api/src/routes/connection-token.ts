import type { Request, RequestHandler, Response } from "express";

import {
  credentialErrorMessage,
  mintApiConnectionToken,
  resolveHttpApiCredential,
} from "../lib/api-credential";

const ERROR_STATUS: Record<string, number> = {
  CONFLICTING_API_CREDENTIALS: 400,
  INVALID_API_CREDENTIAL: 401,
  UNAUTHORIZED: 401,
};

/**
 * Trade a long-lived API key for a one-time WebSocket token, so the key itself
 * never reaches a connection URL. See docs/adr/0016.
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
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    res.json(await mintApiConnectionToken(credential));
  } catch (error) {
    const message = credentialErrorMessage(error);
    const status = ERROR_STATUS[message];

    if (status === undefined) {
      console.error("connection_token.mint_failed", error);
      res.status(500).json({ error: "INTERNAL_ERROR" });
      return;
    }

    res.status(status).json({ error: message });
  }
};
