import { BrowserProviderError, type BrowserProviderId } from "./contract.ts";

export type FetchLike = typeof fetch;

export abstract class HttpProvider {
  protected readonly providerId: BrowserProviderId;
  protected readonly apiKey: string | undefined;
  protected readonly fetcher: FetchLike;

  protected constructor(providerId: BrowserProviderId, apiKey: string | undefined, fetcher: FetchLike = fetch) {
    this.providerId = providerId;
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  protected requireKey(): string {
    if (!this.apiKey) throw new BrowserProviderError(this.providerId, "Provider credential is not configured.");
    return this.apiKey;
  }

  protected async request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(20_000),
        redirect: "error",
      });
    } catch {
      throw new BrowserProviderError(this.providerId, "Provider request failed or timed out.", 503);
    }

    if (!response.ok) {
      // Never echo provider response bodies: they may contain signed URLs or secrets.
      throw new BrowserProviderError(this.providerId, "Provider API returned HTTP " + response.status + ".", response.status);
    }
    if (response.status === 204) return undefined as T;
    try {
      return await response.json() as T;
    } catch {
      throw new BrowserProviderError(this.providerId, "Provider returned an invalid JSON response.", response.status);
    }
  }

  protected safeId(id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      throw new BrowserProviderError(this.providerId, "Invalid provider session identifier.");
    }
    return encodeURIComponent(id);
  }
}
