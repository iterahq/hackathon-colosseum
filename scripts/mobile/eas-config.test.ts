// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file: string) => readFileSync(root + file, "utf8");
interface Profile {
  developmentClient?: boolean;
  distribution?: string;
  autoIncrement?: boolean;
  node?: string;
  android?: { buildType?: string };
}
interface AppJson {
  expo: {
    owner: string;
    runtimeVersion?: unknown;
    backgroundColor: string;
    locales: { pt: string };
    ios: { bundleIdentifier: string; infoPlist: Record<string, unknown>; associatedDomains?: unknown };
    android: { package: string; adaptiveIcon: { backgroundColor: string }; intentFilters?: unknown; permissions?: unknown };
    plugins: unknown[];
    updates: { url: string; checkAutomatically?: string; fallbackToCacheTimeout?: number };
    extra: { eas: { projectId: string } };
  };
}
interface EasJson {
  cli: { appVersionSource: string };
  build: Record<string, Profile>;
  submit: { production: { ios: { ascAppId: string; ascApiKeyPath: string } } };
}
const json = <T>(file: string) => JSON.parse(read(file)) as T;

const expo = json<AppJson>("apps/mobile/app.json").expo;
const eas = json<EasJson>("apps/mobile/eas.json");
const workflow = read(".github/workflows/mobile-eas.yml");

describe("EAS identity (app.json)", () => {
  it("one id for both stores, the Q-2 answer", () => {
    expect(expo.ios.bundleIdentifier).toBe("com.tainanfidelis.iterahq");
    expect(expo.android.package).toBe(expo.ios.bundleIdentifier);
  });

  it("belongs to the Expo org iterahq and the update URL names the same project", () => {
    expect(expo.owner).toBe("iterahq");
    const projectId = expo.extra.eas.projectId as string;
    expect(projectId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(expo.updates.url).toBe(`https://u.expo.dev/${projectId}`);
  });

  it("keeps over-the-air updates off on purpose: the channel exists (url, runtimeVersion) but the app never checks it", () => {
    expect(expo.updates.checkAutomatically).toBe("NEVER");
    expect(expo.updates.url).toMatch(/^https:\/\/u\.expo\.dev\//);
    expect(expo.runtimeVersion).toEqual({ policy: "fingerprint" });
    expect((expo.updates as Record<string, unknown>).codeSigningCertificate).toBeUndefined();
  });

  it("declares no capability the WebView shell does not use, and the associated domains of R-5 and R-20 only", () => {
    expect(Object.keys(expo.ios.infoPlist)).toEqual(["ITSAppUsesNonExemptEncryption", "NSCameraUsageDescription"]);
    expect(Object.keys(JSON.parse(read(`apps/mobile/${expo.locales.pt.replace(/^\.\//, "")}`)))).toEqual(["NSCameraUsageDescription"]);
    expect(expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(expo.ios.associatedDomains).toEqual(["applinks:app.iterahq.dev", "webcredentials:app.iterahq.dev"]);
    expect(Array.isArray(expo.android.intentFilters)).toBe(true);
    expect(expo.android.permissions).toBeUndefined();
  });

  it("keeps the dev client from adding its generated scheme to the store build", () => {
    expect(expo.plugins).toContainEqual(["expo-dev-client", { addGeneratedScheme: false }]);
  });

  it("uses the brand ground for the splash, the icon and the adaptive icon", () => {
    expect(expo.backgroundColor).toBe("#0A0908");
    expect(expo.android.adaptiveIcon.backgroundColor).toBe("#0A0908");
    const splash = expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-splash-screen") as [string, { backgroundColor: string }];
    expect(splash[1].backgroundColor).toBe("#0A0908");
  });
});

describe("eas.json", () => {
  it("numbers builds remotely and has the three profiles", () => {
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(Object.keys(eas.build).sort()).toEqual(["base", "development", "preview", "production"]);
    expect(eas.build.development.developmentClient).toBe(true);
    expect(eas.build.preview.android?.buildType).toBe("apk");
    expect(eas.build.preview.distribution).toBe("internal");
    expect(eas.build.production.distribution).toBe("store");
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.build.production.android?.buildType).toBe("app-bundle");
  });

  it("pins Node to the major the shell CI uses", () => {
    expect(eas.build.base.node).toMatch(/^20\./);
    expect(read(".github/workflows/mobile-shell.yml")).toMatch(/node-version: 20\b/);
  });

  it("carries no secret and no Supabase value: the key is a run-time file, its ids are filled in by the workflow", () => {
    const text = read("apps/mobile/eas.json");
    expect(text).not.toMatch(/EXPO_PUBLIC|SUPABASE|BEGIN PRIVATE KEY|ascApiKeyId|ascApiKeyIssuerId/);
    expect(eas.submit.production.ios.ascAppId).toBe("6819303533");
    expect(eas.submit.production.ios.ascApiKeyPath).toBe("./.secrets/asc-api-key.p8");
    expect(read("apps/mobile/.gitignore")).toMatch(/^\.secrets\/$/m);
  });
});

describe("mobile-eas.yml", () => {
  it("runs only on a manual dispatch, read-only, on the fleet", () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(workflow).not.toMatch(/pull_request|push:|schedule:/);
    expect(workflow).toMatch(/permissions:\n {2}contents: read/);
    expect(workflow.match(/runs-on: \[self-hosted, dfl-runner\]/g)).toHaveLength(2);
    expect(workflow).not.toMatch(/ubuntu-|macos-|windows-/);
  });

  it("starts nothing from a branch other than main", () => {
    expect(workflow.match(/github\.ref == 'refs\/heads\/main'/g)).toHaveLength(2);
  });

  it("pins the actions as mobile-shell.yml does", () => {
    const shell = read(".github/workflows/mobile-shell.yml");
    for (const action of ["actions/checkout@v4", "actions/setup-node@v4"]) {
      expect(shell).toContain(action);
      expect(workflow).toContain(action);
    }
  });

  it("reads the build counter before it builds, and never waits for the build", () => {
    expect(workflow.indexOf("scripts/eas-build-counter.mjs")).toBeGreaterThan(-1);
    expect(workflow.indexOf("scripts/eas-build-counter.mjs")).toBeLessThan(workflow.indexOf('build --platform "$PLATFORM"'));
    expect(workflow).toMatch(/--non-interactive --no-wait/);
  });

  it("names the four secrets and never interpolates an input into a shell line", () => {
    for (const name of ["EXPO_TOKEN", "ASC_API_KEY_P8", "ASC_API_KEY_ID", "ASC_API_ISSUER_ID"]) expect(workflow).toContain(`secrets.${name}`);
    const lines = workflow.split("\n");
    const scripts: string[] = [];
    lines.forEach((line, i) => {
      const run = /^(\s+)run:(.*)$/.exec(line);
      if (!run) return;
      scripts.push(run[2]);
      for (let j = i + 1; j < lines.length && (lines[j].trim() === "" || lines[j].startsWith(run[1] + " ")); j++) scripts.push(lines[j]);
    });
    expect(scripts.length).toBeGreaterThan(5);
    expect(scripts.filter((line) => line.includes("${{"))).toEqual([]);
  });

  it("gives the token only to the steps that call EAS or read the meter", () => {
    const steps = workflow.split(/\n {6}- /);
    const withToken = steps.filter((step) => step.includes("secrets.EXPO_TOKEN")).map((step) => step.split("\n")[0]);
    expect(withToken).toEqual(["name: Build counter (refuses a build above the hold)", "name: EAS build", "name: EAS submit"]);
  });
});
