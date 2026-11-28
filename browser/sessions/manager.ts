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
  /** Atomically persist a session and consume the reservation acquired by reserve(). */
  put(record: BrowserSessionRecord): Promise<void>;
  delete(handle: string): Promise<void>;
  /** Atomically reserve one of an owner's active-session slots before creating a billable provider session. */
  reserve(ownerId: string, maximum: number): Promise<boolean>;
  releaseReservation(ownerId: string): Promise<void>;
}

export interface PublicSessionHandle {
  sessionId: string;
  provider: BrowserProviderId;
  status: "running";
  createdAt: string;
  liveViewUrl?: string;
}

export class BrowserSessionManager {
  private readonly router: ProviderRouter;
  private readonly store: BrowserSessionStore;
  private readonly maxConcurrentPerOwner: number;

  constructor(router: ProviderRouter, store: BrowserSessionStore, maxConcurrentPerOwner = 3) {
    this.router = router;
    this.store = store;
    this.maxConcurrentPerOwner = maxConcurrentPerOwner;
  }

  async create(ownerId: string, options: ProviderSessionOptions = {}): Promise<PublicSessionHandle> {
    this.assertOwner(ownerId);
    // Reservation is atomic in the store, so concurrent create calls cannot exceed the owner limit.
    if (!(await this.store.reserve(ownerId, this.maxConcurrentPerOwner))) {
      throw new BrowserProviderError("steel", "Per-owner browser concurrency limit reached.", 429);
    }

    let reservationHeld = true;
    try {
      routed = await this.router.createSession(options);
      const record: BrowserSessionRecord = {
        handle: randomUUID(),
        ownerId,
        provider: routed.session.provider,
        providerSessionId: routed.session.id,
        createdAt: new Date().toISOString(),
      };
      try {
        // put() atomically converts the reserved slot into an active session row.
        await this.store.put(record);
        reservationHeld = false;
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
    } finally {
      // Provider creation or persistence failed before the reservation was committed.
      if (reservationHeld) await this.store.releaseReservation(ownerId);
    }
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
