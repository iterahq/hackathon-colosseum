/**
 * The stubbed-curl matrix for `release-guard.sh`.
 *
 * WHY THIS FILE IS IN THE REPOSITORY AND NOT IN SOMEBODY'S TERMINAL
 *
 * The version-existence probe that shipped before 2026-08-27 was wrong for
 * months: it asked GitHub Packages for a per-version GET route that does not
 * exist, got 405 every time, compared it to 200, and therefore reported "safe
 * to publish" for EVERY version. It was never once tested against a stub. The
 * only feedback it could ever give was a generic `npm error 409` inside
 * `npm publish`, at release time, to whoever happened to be shipping.
 *
 * The registry cannot be reached from a pull-request job, so the branches are
 * proven here with a `curl` stub on PATH, and proven again live by the
 * workflow's `self-check` step on every trigger. Neither one replaces the
 * other: this file pins the DECISIONS, the live step pins the SHAPE of what the
 * real registry returns.
 *
 * THE INVARIANT THAT MATTERS MOST: an unreadable packument is a HARD ERROR on
 * both paths. It must never read as "free to publish", and it must never read
 * as "already there". Two of the cases below exist only to hold that line.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, "release-guard.sh");

/**
 * A `curl` that answers whatever the case under test wants.
 *
 * It reproduces only the surface `release-guard.sh` actually uses: `-o <file>`
 * receives the body, and `%{http_code}` comes back on stdout. Anything else the
 * real curl does is irrelevant here — if the script ever starts depending on
 * more, this stub stops matching and the test says so.
 */
const CURL_STUB = `#!/usr/bin/env bash
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
if [ -n "$out" ] && [ -n "\${STUB_BODY_FILE:-}" ]; then
  cat "$STUB_BODY_FILE" > "$out"
fi
printf '%s' "\${STUB_HTTP:-000}"
exit "\${STUB_EXIT:-0}"
`;

type Stub = { http: string; body?: string; exit?: string };

type Run = { code: number; out: string; err: string; kv: Record<string, string> };

function run(args: string[], stub: Stub): Run {
  const dir = mkdtempSync(path.join(tmpdir(), "release-guard-"));
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  const curl = path.join(bin, "curl");
  writeFileSync(curl, CURL_STUB);
  chmodSync(curl, 0o755);

  const bodyFile = path.join(dir, "packument.json");
  writeFileSync(bodyFile, stub.body ?? "");

  const res = spawnSync("bash", [GUARD, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      STUB_HTTP: stub.http,
      STUB_BODY_FILE: bodyFile,
      STUB_EXIT: stub.exit ?? "0",
      NODE_AUTH_TOKEN: "stub-token",
    },
  });

  const out = res.stdout ?? "";
  const kv: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const m = /^([a-z_]+)=(.*)$/.exec(line.trim());
    if (m) kv[m[1]] = m[2];
  }
  return { code: res.status ?? -1, out, err: res.stderr ?? "", kv };
}

/** A packument the way GitHub Packages serves one, reduced to what is read. */
function packument(versions: string[], latest?: string): string {
  return JSON.stringify({
    name: "@iterahq/activities",
    "dist-tags": latest === undefined ? {} : { latest },
    versions: Object.fromEntries(versions.map((v) => [v, { name: "@iterahq/activities", version: v }])),
  });
}

const PUBLISHED = packument(["0.4.0", "1.0.0"], "1.0.0");

describe("decide — the version is NOT in the registry", () => {
  it("releases on a push", () => {
    const r = run(["decide", "1.1.0", "push"], { http: "200", body: PUBLISHED });
    expect(r.code).toBe(0);
    expect(r.kv.already_published).toBe("no");
    expect(r.kv.should_publish).toBe("true");
  });

  it("releases on a dispatch", () => {
    const r = run(["decide", "1.1.0", "workflow_dispatch"], { http: "200", body: PUBLISHED });
    expect(r.code).toBe(0);
    expect(r.kv.should_publish).toBe("true");
  });

  it("reports dist-tags.latest, which is what the live self-check asserts against", () => {
    const r = run(["decide", "1.1.0", "push"], { http: "200", body: PUBLISHED });
    expect(r.kv.latest).toBe("1.0.0");
  });
});

describe("decide — the version IS in the registry", () => {
  it("skips cleanly on a push, because most merges do not bump the version", () => {
    const r = run(["decide", "1.0.0", "push"], { http: "200", body: PUBLISHED });
    expect(r.code).toBe(0);
    expect(r.kv.already_published).toBe("yes");
    expect(r.kv.should_publish).toBe("false");
  });

  it("is a hard error on a dispatch, because a human asked for it on purpose", () => {
    const r = run(["decide", "1.0.0", "workflow_dispatch"], { http: "200", body: PUBLISHED });
    expect(r.code).toBe(3);
    expect(r.kv.reason).toBe("dispatch-on-existing-version");
    expect(r.kv.should_publish).toBeUndefined();
  });

  it("matches the version EXACTLY — a prefix is not a match", () => {
    // `1.0` and `1.0.0-rc.1` are different releases. A substring test on the
    // packument text would call both of them published.
    const r = run(["decide", "1.0.0-rc.1", "push"], { http: "200", body: PUBLISHED });
    expect(r.code).toBe(0);
    expect(r.kv.should_publish).toBe("true");
  });

  it("does not treat an inherited Object property as a published version", () => {
    // `versions["constructor"]` is truthy on any plain object. The lookup uses
    // hasOwnProperty for exactly this reason.
    const r = run(["decide", "constructor", "push"], { http: "200", body: PUBLISHED });
    expect(r.code).toBe(0);
    expect(r.kv.already_published).toBe("no");
  });
});

describe("decide — 404 is the first release", () => {
  it("publishes, on both paths, because the registry ANSWERED that the package is absent", () => {
    for (const event of ["push", "workflow_dispatch"]) {
      const r = run(["decide", "0.1.0", event], { http: "404", body: '{"error":"Not found"}' });
      expect(r.code).toBe(0);
      expect(r.kv.already_published).toBe("no");
      expect(r.kv.should_publish).toBe("true");
      expect(r.kv.latest).toBe("");
    }
  });
});

describe("decide — an unreadable packument is a HARD ERROR on both paths", () => {
  // This is the invariant. Every case here must exit 2 and must emit NEITHER
  // `should_publish=true` (which would publish blind) NOR
  // `should_publish=false` (which would silently skip a real release).
  const unreadable: Array<[string, Stub]> = [
    ["403 — the token lost read:packages", { http: "403", body: '{"error":"Forbidden"}' }],
    ["500 — the registry is having a bad day", { http: "500", body: "" }],
    ["401 — no credentials reached the registry", { http: "401", body: "" }],
    ["405 — the dead per-version route that started all this", { http: "405", body: "" }],
    ["000 — curl could not connect at all", { http: "000", body: "", exit: "7" }],
    ["200 but the body is not JSON", { http: "200", body: "<html>502 Bad Gateway</html>" }],
    ["200 but there is no versions map", { http: "200", body: '{"name":"@iterahq/activities"}' }],
    ["200 but versions is an array, not an object", { http: "200", body: '{"versions":[]}' }],
  ];

  for (const [name, stub] of unreadable) {
    it(`${name} -> exit 2, no verdict`, () => {
      for (const event of ["push", "workflow_dispatch"]) {
        const r = run(["decide", "1.0.0", event], stub);
        expect(r.code, `${name} on ${event}`).toBe(2);
        expect(r.kv.reason).toBe("unreadable-packument");
        expect(r.kv.should_publish).toBeUndefined();
        expect(r.kv.already_published).toBeUndefined();
      }
    });
  }
});

describe("self-check — the step that runs live on every trigger", () => {
  it("passes against a healthy registry", () => {
    const r = run(["self-check"], { http: "200", body: PUBLISHED });
    expect(r.out).toContain("reads as absent");
    expect(r.code).toBe(0);
  });

  it("FAILS when the detection reports absent for everything (the 2026-08 bug)", () => {
    // A packument that answers 200 and names a latest tag, but whose versions
    // map is empty: from the detection's point of view every version — the
    // registry's own `latest` included — is absent. A one-sided self-check that
    // only asserted "the sentinel is absent" would sail straight past this.
    const r = run(["self-check"], { http: "200", body: packument([], "1.0.0") });
    expect(r.code).toBe(1);
    expect(r.out).toContain("SELF-CHECK FAILED");
    expect(r.out).toContain("says 'absent' for everything");
  });

  it("FAILS when the detection reports published for everything", () => {
    const everything = JSON.stringify({
      "dist-tags": { latest: "1.0.0" },
      versions: { "1.0.0": {}, "0.0.0-does-not-exist": {} },
    });
    const r = run(["self-check"], { http: "200", body: everything });
    expect(r.code).toBe(1);
    expect(r.out).toContain("was reported as already published");
  });

  it("FAILS when the registry cannot be read at all", () => {
    const r = run(["self-check"], { http: "500", body: "" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("could not reach a verdict");
  });

  it("skips the latest-tag assertions on a first release, and says so", () => {
    const r = run(["self-check"], { http: "404", body: '{"error":"Not found"}' });
    expect(r.code).toBe(0);
    expect(r.out).toContain("SKIPPED");
  });
});

describe("usage", () => {
  it("refuses a call with the wrong number of arguments", () => {
    expect(run(["decide", "1.0.0"], { http: "200", body: PUBLISHED }).code).toBe(64);
    expect(run([], { http: "200", body: PUBLISHED }).code).toBe(64);
  });
});
