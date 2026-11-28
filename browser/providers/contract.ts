export type BrowserProviderId = "steel" | "hyperbrowser" | "browserbase";
export type ProviderSessionStatus = "starting" | "running" | "stopped" | "failed" | "unknown";

export interface ProviderSessionOptions {
  timeoutMs?: number;
  projectId?: string;
  metadata?: Record<string, string>;
}

export interface ProviderSession {
  provider: BrowserProviderId;
  id: string;
  status: ProviderSessionStatus;
  cdpUrl: string;
  liveViewUrl?: string;
  createdAt?: string;
  expiresAt?: string;
  /** Provider response is deliberately not copied here: it may contain credentials. */
}

export interface ProviderHealth {
  provider: BrowserProviderId;
  configured: boolean;
  /** Configuration presence only; this is not a live authentication or quota check. */
  status: "configured" | "missing_credentials";
}

export interface BrowserProvider {
  readonly id: BrowserProviderId;
  health(): ProviderHealth;
  createSession(options?: ProviderSessionOptions): Promise<ProviderSession>;
  getSession(sessionId: string): Promise<ProviderSession>;
  stopSession(sessionId: string): Promise<void>;
}

export class BrowserProviderError extends Error {
  readonly provider: BrowserProviderId;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(provider: BrowserProviderId, message: string, statusCode?: number) {
    super(message);
    this.name = "BrowserProviderError";
    this.provider = provider;
    this.statusCode = statusCode;
    this.retryable = statusCode === 408 || statusCode === 425 || statusCode === 429 || (statusCode !== undefined && statusCode >= 500);
  }
}
