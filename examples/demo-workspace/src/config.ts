export interface AppConfig {
  port: number;
  logLevel: "debug" | "info" | "warning";
}

function readEnvironment(): Record<string, string | undefined> {
  return {
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL
  };
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

export function loadConfig(): AppConfig {
  const environment = readEnvironment();
  const logLevel = environment.LOG_LEVEL ?? "info";
  if (!["debug", "info", "warning"].includes(logLevel)) {
    throw new Error("LOG_LEVEL is invalid");
  }

  return {
    port: parsePort(environment.PORT),
    logLevel: logLevel as AppConfig["logLevel"]
  };
}
