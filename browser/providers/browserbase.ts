import { BrowserProviderError, type BrowserProvider, type BrowserProviderId, type ProviderHealth, type ProviderSession, type ProviderSessionOptions } from "./contract.ts";
import { HttpProvider, type FetchLike } from "./http.ts";

type BrowserbaseSession = {
  id: string;
  status?: string;
  connectUrl?: string;
  createdAt?: string;
  expiresAt?: string;
};

export class BrowserbaseProvider extends HttpProvider implements BrowserProvider {
  readonly id: BrowserProviderId = "browserbase";
  private readonly baseUrl: string;
  private readonly projectId: string | undefined;

  constructor(options: { apiKey?: string; projectId?: string; baseUrl?: string; fetcher?: FetchLike } = {}) {
    super("browserbase", options.apiKey ?? process.env.BROWSERBASE_API_KEY, options.fetcher ?? fetch);
    this.projectId = options.projectId ?? process.env.BROWSERBASE_PROJECT_ID;
    this.baseUrl = (options.baseUrl ?? "https://api.browserbase.com").replace(/\/$/, "");
  }

  health(): ProviderHealth {
    const configured = Boolean(this.apiKey && this.projectId);
    return { provider: this.id, configured, status: configured ? "configured" : "missing_credentials" };
  }

  private headers(): HeadersInit {
    return { "X-BB-API-Key": this.requireKey(), "Content-Type": "application/json" };
  }

  private normalize(s: BrowserbaseSession): ProviderSession {
    if (!s.id || !s.connectUrl) throw new BrowserProviderError(this.id, "Browserbase response omitted the session ID or CDP URL.");
    return {
      provider: this.id, id: s.id,
      status: s.status === "RUNNING" || s.status === "PENDING" ? "running" : s.status === "COMPLETED" || s.status === "TIMED_OUT" ? "stopped" : s.status === "ERROR" ? "failed" : "unknown",
      cdpUrl: s.connectUrl,
      ...(s.createdAt ? { createdAt: s.createdAt } : {}),
      ...(s.expiresAt ? { expiresAt: s.expiresAt } : {}),
    };
  }

  async createSession(options: ProviderSessionOptions = {}): Promise<ProviderSession> {
    this.requireKey();
    const projectId = options.projectId ?? this.projectId;
    if (!projectId) throw new BrowserProviderError(this.id, "BROWSERBASE_PROJECT_ID is required.");
    const timeout = options.timeoutMs === undefined ? undefined : Math.max(60, Math.min(21_600, Math.ceil(options.timeoutMs / 1000)));
    const body: Record<string, unknown> = { projectId, ...(timeout === undefined ? {} : { timeout }) };
    if (options.metadata) body.userMetadata = options.metadata;
    const s = await this.request<BrowserbaseSession>(this.baseUrl + "/v1/sessions", {
      method: "POST", headers: this.headers(), body: JSON.stringify(body),
    });
    return this.normalize(s);
  }

  async getSession(sessionId: string): Promise<ProviderSession> {
    const s = await this.request<BrowserbaseSession>(this.baseUrl + "/v1/sessions/" + this.safeId(sessionId), {
      method: "GET", headers: this.headers(),
    });
    return this.normalize(s);
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.request(this.baseUrl + "/v1/sessions/" + this.safeId(sessionId), {
      method: "POST", headers: this.headers(), body: JSON.stringify({ status: "REQUEST_RELEASE" }),
    });
  }
}
