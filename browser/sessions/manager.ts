import { randomUUID } from "node:crypto";
import { BrowserProviderError, type BrowserProviderId, type ProviderSession, type ProviderSessionOptions } from "../providers/contract.ts";
import { ProviderRouter } from "../routing/provider-router.ts";

export interface BrowserSessionRecord {
  handle: string;
  ownerId: string;
  provider: BrowserProviderId;
  providerSessionId: string;
  createdAt: string;
}

export interface BrowserSessionStore {
  get(handle: string): Promise<BrowserSessionRecord | undefined>;
  listByOwner(ownerId: string): Promise<BrowserSessionRecord[]>;
  put(record: BrowserSessionRecord): Promise<void>;
  delete(handle: string): Promise<void>;
}

export interface PublicSessionHandle {
  sessionId: string;
  provider: BrowserProviderId;
  status: "running";
  createdAt: string;
  liveViewUrl?: string;
}

export class BrowserSessionManager {
  constructor(
    private readonly router: ProviderRouter,
    private readonly store: BrowserSessionStore,
    private readonly maxConcurrentPerOwner = 3,
  ) {}

  async create(ownerId: string, options: ProviderSessionOptions = {}): Promise<PublicSessionHandle> {
    this.assertOwner(ownerId);
    const owned = await this.store.listByOwner(ownerId);
    if (owned.length >= this.maxConcurrentPerOwner) {
      throw new BrowserProviderError("steel", "Per-owner browser concurrency limit reached.", 429);
    }

    const routed = await this.router.createSession(options);
    const record: BrowserSessionRecord = {
      handle: randomUUID(),
      ownerId,
      provider: routed.session.provider,
      providerSessionId: routed.session.id,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.store.put(record);
    } catch {
      // Do not orphan a billable provider session if durable ownership storage fails.
      await this.router.getProvider(record.provider)?.stopSession(record.providerSessionId).catch(() => {});
      throw new BrowserProviderError(record.provider, "Could not persist session ownership; provider session was stopped.");
    }

    return {
      sessionId: record.handle,
      provider: record.provider,
      status: "running",
      createdAt: record.createdAt,
      ...(routed.session.liveViewUrl ? { liveViewUrl: routed.session.liveViewUrl } : {}),
    };
  }

  async resolve(ownerId: string, handle: string): Promise<ProviderSession> {
    this.assertOwner(ownerId);
    const record = await this.requireOwned(ownerId, handle);
    const provider = this.router.getProvider(record.provider);
    if (!provider) throw new BrowserProviderError(record.provider, "Session provider is not configured.");
    return provider.getSession(record.providerSessionId);
  }

  async close(ownerId: string, handle: string): Promise<void> {
    this.assertOwner(ownerId);
    const record = await this.requireOwned(ownerId, handle);
    const provider = this.router.getProvider(record.provider);
    if (!provider) throw new BrowserProviderError(record.provider, "Session provider is not configured.");
    await provider.stopSession(record.providerSessionId);
    await this.store.delete(record.handle);
  }

  private async requireOwned(ownerId: string, handle: string): Promise<BrowserSessionRecord> {
    if (!/^[0-9a-f-]{36}$/i.test(handle)) throw new BrowserProviderError("steel", "Invalid browser session handle.", 404);
    const record = await this.store.get(handle);
    if (!record || record.ownerId !== ownerId) {
      // Do not reveal whether a handle belongs to another account.
      throw new BrowserProviderError("steel", "Browser session not found.", 404);
    }
    return record;
  }

  private assertOwner(ownerId: string): void {
    if (typeof ownerId !== "string" || ownerId.trim().length === 0 || ownerId.length > 256) {
      throw new BrowserProviderError("steel", "Authenticated owner identity is required.", 401);
    }
  }
}
