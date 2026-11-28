import { BrowserProviderError, type BrowserProvider, type BrowserProviderId, type ProviderHealth, type ProviderSession, type ProviderSessionOptions } from "./contract.ts";
import { HttpProvider, type FetchLike } from "./http.ts";

type HyperbrowserSession = {
  id: string;
  status?: string;
  wsEndpoint?: string;
  liveUrl?: string;
  createdAt?: string;
  expiresAt?: string;
};

export class HyperbrowserProvider extends HttpProvider implements BrowserProvider {
  readonly id: BrowserProviderId = "hyperbrowser";
  private readonly baseUrl: string;

  constructor(options: { apiKey?: string; baseUrl?: string; fetcher?: FetchLike } = {}) {
    super("hyperbrowser", options.apiKey ?? process.env.HYPERBROWSER_API_KEY, options.fetcher ?? fetch);
    this.baseUrl = (options.baseUrl ?? "https://api.hyperbrowser.ai").replace(/\/$/, "");
  }

  health(): ProviderHealth {
    const configured = Boolean(this.apiKey);
    return { provider: this.id, configured, status: configured ? "configured" : "missing_credentials" };
  }

  private headers(): HeadersInit {
    return { "x-api-key": this.requireKey(), "Content-Type": "application/json" };
  }

  private normalize(s: HyperbrowserSession): ProviderSession {
    if (!s.id || !s.wsEndpoint) throw new BrowserProviderError(this.id, "Hyperbrowser response omitted the session ID or CDP endpoint.");
    return {
      provider: this.id, id: s.id,
      status: s.status === "active" || s.status === "running" ? "running" : s.status === "stopped" || s.status === "completed" ? "stopped" : s.status === "failed" ? "failed" : "unknown",
      cdpUrl: s.wsEndpoint,
      ...(s.liveUrl ? { liveViewUrl: s.liveUrl } : {}),
      ...(s.createdAt ? { createdAt: s.createdAt } : {}),
      ...(s.expiresAt ? { expiresAt: s.expiresAt } : {}),
    };
  }

  async createSession(options: ProviderSessionOptions = {}): Promise<ProviderSession> {
    this.requireKey();
    const body: Record<string, unknown> = {};
    if (options.timeoutMs !== undefined) body.timeoutMinutes = Math.max(1, Math.ceil(options.timeoutMs / 60_000));
    if (options.metadata) body.metadata = options.metadata;
    const s = await this.request<HyperbrowserSession>(this.baseUrl + "/api/session", {
      method: "POST", headers: this.headers(), body: JSON.stringify(body),
    });
    return this.normalize(s);
  }

  async getSession(sessionId: string): Promise<ProviderSession> {
    const s = await this.request<HyperbrowserSession>(this.baseUrl + "/api/session/" + this.safeId(sessionId), {
      method: "GET", headers: this.headers(),
    });
    return this.normalize(s);
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.request(this.baseUrl + "/api/session/" + this.safeId(sessionId) + "/stop", {
      method: "PUT", headers: this.headers(),
    });
  }
}
