export type BrowserStatus = "OK" | "NEEDS_HUMAN" | "BLOCKED" | "ERROR";
export type DiscoveryLayer = "DL01" | "DL02" | "DL03" | "DL04" | "DL05" | "DL06" | "DL07" | "DL08" | "DL09" | "DL10" | "DL11" | "DL12";
export interface EvidencePacket { requested_url: string; final_url: string; redirects: string[]; fetched_at: string; status: number | null; content_type: string | null; sha256: string | null; title: string | null; layer: DiscoveryLayer; via_tor: boolean; engine: string }
export interface BrowserResult<T = unknown> { status: BrowserStatus; data?: T; message?: string; evidence?: EvidencePacket }
export interface OpenOptions { url: string; wait_until?: "domcontentloaded" | "load"; timeout_ms?: number }
export interface ReadOptions { selector?: string; max_chars?: number }
export interface ClickOptions { selector: string; confirm?: boolean }
export interface TypeOptions { selector: string; text: string }
export interface SubmitOptions { selector?: string; confirm: boolean }
export interface ScreenshotOptions { full_page?: boolean }
export interface DownloadOptions { url: string; filename?: string }
export interface BrowserEngine {
 readonly name: string;
 open(options: OpenOptions): Promise<BrowserResult>;
 read(options?: ReadOptions): Promise<BrowserResult<{ text: string; title: string; url: string }>>;
 click(options: ClickOptions): Promise<BrowserResult>;
 type(options: TypeOptions): Promise<BrowserResult>;
 submit(options: SubmitOptions): Promise<BrowserResult>;
 screenshot(options?: ScreenshotOptions): Promise<BrowserResult<{ path: string }>>;
 download(options: DownloadOptions): Promise<BrowserResult<{ path: string; size: number; content_type: string }>>;
 close(): Promise<void>;
}
