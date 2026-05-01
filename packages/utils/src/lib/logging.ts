import { initLogger, type LoggerConfig } from "evlog";
import { createAxiomDrain, type AxiomConfig } from "evlog/axiom";

type EnvMap = Record<string, string | undefined>;

export type SharedLoggerOptions = {
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
};

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
    token,
    orgId: options.axiom?.orgId ?? env.AXIOM_ORG_ID,
    timeout: options.axiom?.timeout,
    retries: options.axiom?.retries,
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
  options: SharedLoggerOptions,
): LoggerConfig => {
  const env = options.env ?? getRuntimeEnv();

  return {
    enabled: options.enabled ?? true,
    pretty: options.pretty ?? env.NODE_ENV !== "production",
    silent: options.silent ?? false,
    minLevel: options.minLevel ?? "info",
    env: {
      service: options.service,
      environment: options.environment ?? env.NODE_ENV ?? "development",
    },
    drain: getAxiomDrain(options),
  };
};

export const initSharedLogger = (options: SharedLoggerOptions): void => {
  initLogger(createSharedLoggerConfig(options));
};
