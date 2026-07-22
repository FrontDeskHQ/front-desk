import { initLogger } from "evlog";
import type { LoggerConfig } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import type { AxiomConfig } from "evlog/axiom";

export { createLogger, createRequestLogger, log } from "evlog";
export { createAILogger, createEvlogIntegration } from "evlog/ai";

type EnvMap = Record<string, string | undefined>;

export interface SharedLoggerOptions {
  service: string;
  environment?: string;
  enabled?: boolean;
  pretty?: boolean;
  silent?: boolean;
  minLevel?: LoggerConfig["minLevel"];
  axiom?: {
    dataset?: string;
    token?: string;
    orgId?: string;
    edgeUrl?: string;
    baseUrl?: string;
    timeout?: number;
    retries?: number;
  };
  env?: EnvMap;
}

const getRuntimeEnv = (): EnvMap => {
  const processLike = globalThis as {
    process?: {
      env?: EnvMap;
    };
  };

  return processLike.process?.env ?? {};
};

const getAxiomDrain = (options: SharedLoggerOptions): LoggerConfig["drain"] => {
  const env = options.env ?? getRuntimeEnv();
  const dataset = options.axiom?.dataset ?? env.AXIOM_DATASET;
  const token = options.axiom?.token ?? env.AXIOM_TOKEN;

  if (!dataset || !token) {
    return undefined;
  }

  const config: Partial<AxiomConfig> = {
    dataset,
    orgId: options.axiom?.orgId ?? env.AXIOM_ORG_ID,
    retries: options.axiom?.retries,
    timeout: options.axiom?.timeout,
    token,
  };

  const edgeUrl = options.axiom?.edgeUrl ?? env.AXIOM_EDGE_URL;
  const baseUrl = options.axiom?.baseUrl ?? env.AXIOM_URL;

  if (edgeUrl) {
    config.edgeUrl = edgeUrl;
  } else if (baseUrl) {
    config.baseUrl = baseUrl;
  }

  return createAxiomDrain(config);
};

export const createSharedLoggerConfig = (
  options: SharedLoggerOptions
): LoggerConfig => {
  const env = options.env ?? getRuntimeEnv();

  return {
    drain: getAxiomDrain(options),
    enabled: options.enabled ?? true,
    env: {
      environment: options.environment ?? env.NODE_ENV ?? "development",
      service: options.service,
    },
    minLevel: options.minLevel ?? "info",
    pretty: options.pretty ?? env.NODE_ENV !== "production",
    silent: options.silent ?? false,
  };
};

export const initSharedLogger = (options: SharedLoggerOptions): void => {
  initLogger(createSharedLoggerConfig(options));
};
