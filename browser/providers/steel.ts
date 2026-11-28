import { BrowserProviderError, type BrowserProvider, type BrowserProviderId, type ProviderHealth, type ProviderSession, type ProviderSessionOptions } from "./contract.ts";
import { HttpProvider, type FetchLike } from "./http.ts";

type SteelSession = {
  id: string;
  status?: string;
  websocketUrl?: string;
  debugUrl?: string;
  createdAt?: string;
  timeout?: number;
};

export class SteelProvider extends HttpProvider implements BrowserProvider {
  readonly id: BrowserProviderId = "steel";
  private readonly baseUrl: string;

  constructor(options: { apiKey?: string; baseUrl?: string; fetcher?: FetchLike } = {}) {
    super("steel", options.apiKey ?? process.env.STEEL_API_KEY, options.fetcher ?? fetch);
    this.baseUrl = (options.baseUrl ?? "https://api.steel.dev").replace(/\/$/, "");
  }

  health(): ProviderHealth {
    const configured = Boolean(this.apiKey);
    return { provider: this.id, configured, status: configured ? "configured" : "missing_credentials" };
  }

  private headers(): HeadersInit {
    return { "steel-api-key": this.requireKey(), "Content-Type": "application/json" };
  }

  private normalize(s: SteelSession): ProviderSession {
    if (!s.id || !s.websocketUrl) throw new BrowserProviderError(this.id, "Steel response omitted the session ID or CDP URL.");
    return {
      provider: this.id, id: s.id,
      status: s.status === "live" ? "running" : s.status === "released" ? "stopped" : s.status === "failed" ? "failed" : "unknown",
      cdpUrl: s.websocketUrl,
      ...(s.debugUrl ? { liveViewUrl: s.debugUrl } : {}),
      ...(s.createdAt ? { createdAt: s.createdAt } : {}),
    };
  }

  async createSession(options: ProviderSessionOptions = {}): Promise<ProviderSession> {
    this.requireKey();
    const body: Record<string, unknown> = { headless: true, persistProfile: false };
    if (options.timeoutMs !== undefined) body.timeout = Math.max(60_000, Math.min(options.timeoutMs, 3_600_000));
    const projectId = options.projectId ?? process.env.STEEL_PROJECT_ID;
    if (projectId) body.projectId = projectId;
    if (options.metadata) body.metadata = options.metadata;
    const s = await this.request<SteelSession>(this.baseUrl + "/v1/sessions", {
      method: "POST", headers: this.headers(), body: JSON.stringify(body),
    });
    return this.normalize(s);
  }

  async getSession(sessionId: string): Promise<ProviderSession> {
    const s = await this.request<SteelSession>(this.baseUrl + "/v1/sessions/" + this.safeId(sessionId), {
      method: "GET", headers: this.headers(),
    });
    return this.normalize(s);
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.request(this.baseUrl + "/v1/sessions/" + this.safeId(sessionId) + "/release", {
      method: "POST", headers: this.headers(),
    });
  }
}
