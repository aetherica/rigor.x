import { BrowserProviderError, type BrowserProvider, type BrowserProviderId, type ProviderHealth, type ProviderSession, type ProviderSessionOptions } from "../providers/contract.ts";

export interface ProviderRouterOptions {
  /** Comma-separated provider IDs; default: steel,hyperbrowser,browserbase. */
  order?: BrowserProviderId[];
}

export interface RoutedSession {
  session: ProviderSession;
  attempted: BrowserProviderId[];
}

export class ProviderRouter {
  private readonly providers: Map<BrowserProviderId, BrowserProvider>;
  private readonly order: BrowserProviderId[];

  constructor(providers: BrowserProvider[], options: ProviderRouterOptions = {}) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    this.order = options.order ?? ["steel", "hyperbrowser", "browserbase"];
  }

  health(): ProviderHealth[] {
    return this.order.flatMap((id) => {
      const provider = this.providers.get(id);
      return provider ? [provider.health()] : [];
    });
  }

  async createSession(options: ProviderSessionOptions = {}): Promise<RoutedSession> {
    const attempted: BrowserProviderId[] = [];
    const candidates = this.order
      .map((id) => this.providers.get(id))
      .filter((provider): provider is BrowserProvider => Boolean(provider && provider.health().configured));

    if (candidates.length === 0) {
      throw new BrowserProviderError("steel", "No browser provider has credentials configured.");
    }

    let lastError: unknown;
    for (const provider of candidates) {
      attempted.push(provider.id);
      try {
        const session = await provider.createSession(options);
        return { session, attempted };
      } catch (error) {
        lastError = error;
        // Only retry failures known to be transient or capacity-related.
        // Authentication, validation and unknown errors fail closed.
        if (!(error instanceof BrowserProviderError) || !error.retryable) throw error;
      }
    }
    throw lastError ?? new BrowserProviderError("steel", "All configured browser providers failed.");
  }

  getProvider(id: BrowserProviderId): BrowserProvider | undefined {
    return this.providers.get(id);
  }
}
