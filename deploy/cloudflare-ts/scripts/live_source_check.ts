// Live check of the source adapters against the real internet (not part of CI: it needs network
// access and depends on third-party services). Usage: node --experimental-strip-types scripts/live_source_check.ts
// Prints one JSON line per case; the audit report records the output with its date.
import { checkSource } from "../src/source.ts";
import { crossrefLookup, waybackLookup } from "../src/sources.ts";

const show = (name: string, value: unknown) => console.log(JSON.stringify({ case: name, ...(value as object) }));
const brief = (c: Awaited<ReturnType<typeof checkSource>>) => ({ ok: c.ok, status: c.status, redirects: c.redirects, final_url: c.final_url, bytes: c.bytes, sha256: c.sha256?.slice(0, 16), metadata: c.metadata, injection_signals: c.injection_signals, error: c.error });

show("doi redirect chain + metadata", brief(await checkSource("doi:10.1038/nature12373")));
const ok = await crossrefLookup("10.1038/nature12373");
show("crossref (not retracted)", { title: ok.title, issued: ok.issued, retracted: ok.retracted, error: ok.error });
const wakefield = await crossrefLookup("10.1016/S0140-6736(97)11096-0");
show("crossref (retracted, Wakefield 1998)", { title: wakefield.title, retracted: wakefield.retracted, updates: wakefield.updates, error: wakefield.error });
show("wayback", await waybackLookup("https://example.com/"));
show("public redirect to a private address", brief(await checkSource("https://postman-echo.com/redirect-to?url=http://169.254.169.254/latest/meta-data/")));
show("public redirect to loopback IPv6", brief(await checkSource("https://postman-echo.com/redirect-to?url=http://[::ffff:7f00:1]/")));
show("404 page", brief(await checkSource("https://example.com/this-page-does-not-exist-rigorx")));
show("elsevier doi redirect chain", brief(await checkSource("doi:10.1016/S0140-6736(97)11096-0")));
show("springer doi redirect chain", brief(await checkSource("doi:10.1007/978-3-540-74958-5_14")));
