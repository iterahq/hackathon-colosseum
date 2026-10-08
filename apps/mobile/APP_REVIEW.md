# App Review readiness of the Itera iOS shell

Audit date 2026-10-07. Task DFL-00CD6. Build under audit: version 0.3.0, build 3 (TestFlight).
Model: `apps/ios/APP_REVIEW.md` of the Lesson Studio repo. Each item is marked **pass**, **gap** (with its route) or **owner** (a human holds it).
A claim that was not checked says "not verified". Paths are relative to the repo root.

The shell is an Expo WebView around `https://app.iterahq.dev` (`apps/mobile/app.json` `extra.webOrigin`). The listing, the screenshots, the privacy manifest and the App Store Connect CLI of this PR are in `apps/mobile/store/`, `apps/mobile/app.json` and `apps/mobile/scripts/asc-store.mjs`.

## 1. Config checklist

| # | Item | State | Evidence or route |
|---|---|---|---|
| 1 | Camera, microphone, location, contacts, notification purpose strings | **pass** | `grep -rn "getUserMedia\|mediaDevices\|geolocation\|Notification\." src packages` finds nothing outside tests. No native module of `apps/mobile/package.json` asks for a permission (section 2). `app.json` `ios.infoPlist` holds two keys, the encryption flag and `NSCameraUsageDescription` (row 1b), pinned by `scripts/mobile/eas-config.test.ts`. |
| 1b | Profile photo picker | **pass** (string added 2026-10-08, not seen on a device) | `src/components/profile/ProfileWebSlots.tsx:13` is an `<input type="file">` that accepts images. In a WKWebView iOS offers the photo library (PHPicker, no string) and can offer "Take Photo", which crashes the app without `NSCameraUsageDescription`. The string is now in `app.json` (English) and `apps/mobile/locales/pt.json` (Portuguese). Not verified on a device whether the camera option shows; the string is harmless if it does not. The review notes name the camera use. |
| 2 | `ITSAppUsesNonExemptEncryption` | **pass** | `app.json:18` is `false`. The app uses HTTPS only (system TLS) and no own crypto: `expo-crypto` is used only for random bytes (`getRandomValues` for the session token, `apps/mobile/src/bridgeMessage.ts:98`), which is exempt. Export compliance in App Store Connect: "uses only exempt encryption". |
| 3 | Privacy manifest: tracking | **pass (new)** | `app.json:21-22`: `NSPrivacyTracking=false`, no tracking domains. No ad SDK and no cross-app tracking: the page loads DFL's own Umami and DFL's own error collector (section 2b), neither of which is a tracking domain in Apple's sense (no data joined with other companies' data). |
| 4 | Privacy manifest: collected data | **pass (new)** | Section 2b. Before this PR the key was absent. |
| 5 | Privacy manifest: required-reason APIs | **pass (new)** | Section 2. Two codes were missing from the aggregate manifest and are added. **This changes the native fingerprint (`runtimePolicy: fingerprint`): one new iOS build is needed before submission.** |
| 6 | App Privacy label in App Store Connect | **owner: human** (UI only) | Section 2b lists the exact boxes. The API has no endpoint for it, so `asc-store.mjs status` lists it as a manual step. |
| 7 | Privacy policy URL | **gap until the landing deploy** | `https://iterahq.dev/privacy` answered 200 with the home page on 2026-10-08: no policy existed. The page is written in the landing repo (`iterahq/itera-landing`, routes `/privacy` and `/support`). It names: e-mail, name, user id, optional profile photo, answers and progress, the processors, retention and the deletion route of item 11. Re-check the URL after that deploy (`curl -s https://iterahq.dev/privacy \| grep -c LGPD` must be above 0). The legal text needs the owner's read. |
| 8 | Support URL | **gap until the landing deploy** | `store/metadata.json` uses `https://iterahq.dev/support`, a page of the same landing PR with a contact e-mail and the deletion request route. Re-check after the deploy. |
| 9 | Demo / review account | **owner: human** | The app needs a signed-in account (login only, no sign-up). Create an e-mail and password account that passes the subscription gate (`src/auth/RequireSubscription.tsx`: an active, exempt or grandfathered row, read from `itera.my_subscription`; in the shell a no-access verdict shows `ShellNoAccessScreen`, so a gated account reviews an empty app). Content the reviewer opens: catalog -> program "Dominio -> Agente" -> the lesson at the top of the trail -> answer its single-choice exercises (the path of the screenshots). Put the account in the secrets `ASC_REVIEW_DEMO_USER` and `ASC_REVIEW_DEMO_PASSWORD` (not in the repo). The account writes progress when used: keep it dedicated. |
| 10 | 3.1.1 billing | **pass** for the code, **owner** for the exception | Section 3. |
| 11 | 5.1.1(v) account deletion | **gap** | Section 3. |
| 12 | 4.8 Sign in with Apple | **gap: a real rejection risk** | Section 3. |
| 13 | 4.2 minimum functionality | **gap: high rejection risk** | Section 4. |
| 14 | 2.5.2 downloaded code | **pass** with a policy note | Section 4. |
| 15 | iPad | **pass** | `app.json:14` `supportsTablet: false`: the app is iPhone only, so no iPad screenshots are needed and the iPad review is skipped. |
| 16 | Age rating | **pass** (answers below) | Section 5. |
| 17 | Review notes | **owner: human** | Draft in section 6, also in `store/metadata.json` `review.notes`. |

## 2. Privacy manifest audit per native module

Method: I read the installed iOS sources of every module of `apps/mobile/package.json` (read-only tree
`itera-main-dockercheck/apps/mobile/node_modules`, same lockfile versions, e.g. `expo-updates` 57.0.25, `react-native-webview` 13.16.1)
and searched them for Apple's required-reason list: file timestamps (`attributesOfItem`, `stat`, date keys), disk space
(`volumeAvailableCapacity*`, `systemFreeSize`), `UserDefaults`, boot time (`mach_absolute_time`, `systemUptime`) and active keyboards.
Apple: [Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files/describing-use-of-required-reason-api).

Modules that ship a `PrivacyInfo.xcprivacy`: `expo-constants` (UserDefaults CA92.1), `expo-file-system` (FileTimestamp 0A2A.1 and 3B52.1, DiskSpace E174.1 and 85F4.1),
`expo-eas-client` (UserDefaults CA92.1) and React Native with its pods (FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1). None of the others ships one.

| Module | Required-reason API found | Category and code | In `app.json`? |
|---|---|---|---|
| `expo-updates` | `UserDefaults.standard` in `ios/EXUpdates/UpdatesConfigOverride.swift:15,28,30` | UserDefaults **CA92.1** (data only this app reads) | yes (new) |
| `expo-modules-core` (every Expo module links it) | `FileManager.attributesOfItem` in `ios/Core/Logging/PersistentFileLog.swift:113` (reads `.size` of its own log file) | FileTimestamp **C617.1** (files inside the app container) | yes (new) |
| `expo-constants`, `expo-file-system`, `expo-eas-client`, React Native | ship their own manifest | as above | merged by Xcode, not repeated |
| `expo`, `expo-crypto`, `expo-keep-awake`, `expo-linking`, `expo-router`, `expo-splash-screen`, `expo-web-browser`, `expo-manifests`, `expo-asset`, `expo-font`, `expo-glass-effect`, `@expo/dom-webview` | none found | none | n/a |
| `react-native-webview`, `react-native-screens`, `react-native-safe-area-context` | none found in `ios/` or `apple/` | none | n/a |
| `expo-status-bar` | no iOS sources | none | n/a |
| `expo-dev-client`, `expo-dev-launcher`, `expo-dev-menu` | `UserDefaults` | n/a | n/a: `"debugOnly": true` in `expo-module.config.json` of the launcher and the menu (not verified for `expo-dev-client` itself; it only re-exports them), so a Release build does not link them |

Result: **two reason codes were missing from the aggregate manifest** (CA92.1 for `expo-updates`, C617.1 for `expo-modules-core`). `app.json` had no `privacyManifests` block at all. This PR adds the block (`app.json:20`). Pinned by `apps/mobile/scripts/asc-store.test.mjs`.
Limits: a source search sees known API names, not a call made through a C wrapper. Apple scans the binary at upload and mails any gap (ITMS-91053); treat the first store upload as the final check. Re-run this table when a module is added. Not verified: the built `PrivacyInfo.xcprivacy` (no `expo prebuild` was run; it needs a macOS toolchain or the EAS build).

### 2b. Collected data: manifest and App Privacy label

What the shell sends comes from the web app it loads (Supabase of the Itera project). Decided from the code:
`src/services/profile.service.ts:43` reads `display_name, avatar_url, email, locale`; `uploadAvatar` (`profile.service.ts:110`) stores the optional photo;
answers and progress are written by `src/services/progress.service.ts`; interaction traces go to `activity_traces` (`src/hooks/useAnswerOutbox.ts`, `src/hooks/useAbandonmentBeacon.ts`).
Corrected 2026-10-08: the page the shell loads does measure. `src/lib/analytics.ts` mounts Umami (`analytics.devfellowship.com`, DFL's own server) when the build has a website id, and production has one; `src/App.tsx:131` mounts `ObservabilityProvider` of `@devfellowship/observability`, which is on in every production build and sends error and performance spans to `otel.devfellowship.com` (DFL's own collector). No advertising SDK and no third-party analytics; `@sentry/react` is bundled but has no DSN in the build. Not verified: whether the collector stores what it receives, and whether a span carries the user id (declared as linked, the conservative answer).

| Manifest key (`app.json`) | App Privacy label box (App Store Connect) | Why |
|---|---|---|
| `...CollectedDataTypeName` | Contact Info -> Name | profile `display_name` |
| `...EmailAddress` | Contact Info -> Email Address | login and profile |
| `...UserID` | Identifiers -> User ID | Supabase user id on every row |
| `...PhotosorVideos` | User Content -> Photos or Videos | optional avatar upload |
| `...OtherUserContent` | User Content -> Other User Content | exercise answers, code typed in sandboxes |
| `...ProductInteraction` | Usage Data -> Product Interaction | progress, XP, interaction traces, Umami page views. Purposes: App Functionality and Analytics |
| `...CrashData` | Diagnostics -> Crash Data | errors caught by the observability provider. Purposes: App Functionality and Analytics |
| `...PerformanceData` | Diagnostics -> Performance Data | performance spans of the same provider. Purposes: App Functionality and Analytics |

For every box: **linked to the user's identity: yes. Used to track: no. Purpose: App Functionality**, plus **Analytics** on the three rows that say so. Tick nothing under Location, Contacts, Health, Financial Info, Purchases, Browsing History or Search History.

## 3. Account and billing rules

**3.1.1 (in-app purchase): the code holds the line.** Inside the shell the app shows no sign-up, price or checkout (plan row W-7, #586).
- `/signup`, `/subscribe` and `/subscribe/return` are `WebOnlyRoute`: `src/App.tsx:171,277,287`; in the shell they go to `/` (`src/components/shell/WebOnlyRoute.tsx`, tested by `src/components/shell/WebOnlyRoute.test.tsx:34`).
- The sign-up link of the login page is inside `<WebOnly>` (`src/pages/auth/AuthPage.tsx:138`); `LockedCatalogCard`, `LockedProgramView`, `AppHeader` and `VisitorBanner` are gated the same way, and `RequireSubscription` shows `ShellNoAccessScreen` instead of a subscribe prompt (header of `src/auth/RequireSubscription.tsx`).
- Stripe origins are refused in the WebView: `apps/mobile/src/origin.ts:58` (`BLOCKED_ORIGINS`), tested in `apps/mobile/src/origin.test.ts`.
- `scripts/shell-commerce.test.ts:111` scans the real tree for `/subscribe`, `/signup`, Stripe hosts and subscription or price wording outside a gate, against a closed list of files. It is a tripwire, not a proof (its own header says so).
- The listing copy has no price or billing word; `asc-store.mjs` refuses a push that has one (`FORBIDDEN_BILLING`, tested).
- Screenshots show the shell surface (no "Criar conta").
Open point **(owner: human)**: Apple still asks how a gated app earns. The honest answer is "accounts and access are sold on the web, to organisations" and the exception to name is 3.1.3(c) (enterprise services: sold directly to organisations for their people). The landing page `https://iterahq.dev` also sells to individuals ("Assinar", "Preços" on the page, 2026-10-07), which weakens 3.1.3(c). Not verified how Apple will read it. Decide the exception before submission and keep the review notes consistent with it.

**5.1.1(v) account deletion: gap.** The app has no in-app account creation: sign-up is hidden in the shell (above), so the guideline's trigger ("apps that support account creation") is arguably not met. But account creation exists on the web (`/signup`, `src/App.tsx:171`) and the same Supabase account is used. **The web has no deletion route either:** `grep -rniE "delete_account|deleteUser|auth\.admin|delete (my )?account" src packages db apps/mobile/src` finds nothing. Route: (a) keep the notes explicit that the shell has no creation flow and rely on that reading, with a support address that deletes on request (needs item 8); (b) if Apple rejects, build deletion (a service in `dfl-services`, not a database function; it needs a schema inventory of user-owned tables and a human-merged migration). Owner: Tainan decides (a) or (b). Not verified: whether `learn.devfellowship.com/auth/federate` (the "Entrar com DFL" sheet) offers account creation; if it does, a reviewer can reach creation from the app.

**4.8 Sign in with Apple: a real rejection risk, not a pass.** Facts:
- The login page offers e-mail and password (`AuthPage.tsx:48`, Supabase `signInWithPassword`), an e-mail code (`AuthPage.tsx` link "Entrar com código ou link mágico", `verifyOtp` in `src/services/otpAuth.service.ts:69`) and a button "Entrar com DFL" (`AuthPage.tsx:122`).
- "Entrar com DFL" sends the user to `https://learn.devfellowship.com/auth/federate` (`src/auth/dflFederation.ts:36`) and back to `/auth/dfl/callback` with a DFL token that the Itera API exchanges for an Itera session. In the shell it runs in `WebBrowser.openAuthSessionAsync` (`apps/mobile/app/[...path].tsx:345`, `apps/mobile/src/dflAuthSession.ts`). DFL (DevFellowship) is the company that operates Itera: its own account system, not Google, Facebook, Apple, X or LinkedIn.
- There is no `signInWithOAuth` or other third-party social login in `src/`.
- Exception claimed: **4.8, "apps that exclusively use your company's own account setup and sign-in systems"**. Weak points: (1) the app is published under an individual Apple team (`EXPO_APPLE_TEAM_TYPE: INDIVIDUAL`, `.github/workflows/mobile-eas.yml`) while DFL is a separate company, so a reviewer may read DFL as a third party; (2) DFL's own login page could itself offer a social login (not verified: I did not open it).
- Cost to remove the risk: add Sign in with Apple, or remove the DFL button from the shell. Owner: Tainan. Rating: **medium to high** that this triggers a question or a rejection; I cannot say which from here.

## 4. Guidelines 2.5.2 and 4.2

**2.5.2 (no downloaded code that changes features): pass, with a policy.** The shell loads the web app from a remote origin on purpose (`extra.webOrigin`, `app.json:138`), as every WebView app does; Apple allows web content in a WKWebView. `expo-updates` is installed but `updates.checkAutomatically` is `NEVER` (`app.json:134`), so no OTA JavaScript replaces the bundle on launch (`docs/mobile-shell.md` "Over-the-air updates: off on purpose"). Policy note for the owner: web deploys change what the app shows after review; keep them to what the review notes describe.

**4.2 (minimum functionality): high rejection risk.** Honest summary: the app is mostly a WebView shell around a website. Apple rejects "a repackaged website". What is native today:

| Native today | Evidence | Weight under 4.2 |
|---|---|---|
| Offline / failure card with retry and "open in browser" | `apps/mobile/app/[...path].tsx:536`, `apps/mobile/src/OfflineCard.tsx` | low: error handling |
| Universal links `applinks:app.iterahq.dev` and the deep-link router | `app.json:16`, `apps/mobile/src/deepLink.ts`, `apps/mobile/app/+native-intent.ts` | low to medium: a real system integration, but a website can have universal links |
| System auth session for "Entrar com DFL" | `[...path].tsx:345` | low |
| Keep the screen awake during a lesson (a page-driven claim) | `[...path].tsx:135`, `apps/mobile/src/keepAwakeHolder.ts` | low |
| Launch gate with an "update now" card | `[...path].tsx:232`, `apps/mobile/src/UpdateNowCard.tsx`, `apps/mobile/src/shellGate.ts` | low |
| Session bridge page <-> shell (`auth.session`, `shell.version`) | `apps/mobile/src/bridgeMessage.ts`, `apps/mobile/src/nativeSession.ts` | none for the user |
| Universal NotFound screen (`packages/screens/src/not-found`) | **only a dev preview**: `apps/mobile/app/preview/not-found.tsx` redirects home when `!__DEV__`; the route map still serves `*` through the WebView (`route-map.json:34`) | none in a release build |

There is no native lesson, exercise, trail, push notification, offline lesson or widget. Learning content is only in the web page. Nothing in this PR changes that. Routes, in order of cost: (1) accept the risk and make the review notes explain the product (section 6); (2) add one native capability that matters to a learner, most cheaply push reminders for the streak (it needs the permission string, a manifest review and a new build); (3) make the first native route real (the plan's `/catalog` as a universal screen exists as a draft but its `mode` is still `webview`). Owner: Tainan. I would expect a rejection or a question under 4.2 at the first review; I cannot measure it.

## 5. Age rating answers

All **None / No** (`store/metadata.json` `ageRating`), from the code:
- No violence, sexual content, profanity, horror, medical, gambling, contests or drug references in the product itself (lessons are about data, AI, design and management; authored content, reviewed by staff).
- Unrestricted web access: **No**. The WebView only loads the app origin (`apps/mobile/src/origin.ts`) and sends other links to the system browser (`apps/mobile/src/openExternal.ts`).
- User-generated content: comments are an author tool (`src/services/authorCanvas.service.ts`; staff routes stay in the browser). **Live classes are shell routes** (`/live/:sessionId`, `/g/:code`, `route-map.json:38`, claimed as universal links on iOS, `docs/mobile-shell.md` "Deep links"). Checked in the code on 2026-10-08: the "chat" of `src/components/live/LiveStage.tsx` and `LiveStageBody.tsx` is the mirror of the learner's own chat exercise (a scripted or AI sandbox) shown on the stage, not a channel between learners; no file under `src/components/live` sends free text from one learner to another. Messaging and user-generated content: No. Not verified in a live session.
- Apple's 2025 questionnaire: the API refused a declaration without `advertising`, `ageAssurance`, `healthOrWellnessTopics`, `lootBox`, `messagingAndChat`, `parentalControls` and `userGeneratedContent` (run 37849199393). All seven are `false` in `metadata.json`: no ads, no age check, no health topic, no loot box, no channel between learners, no parental control. `userGeneratedContent: false` is the owner's call to confirm: in a live class the instructor can put a learner's answer on the stage for that closed class.
Expected rating: 4+.

## 6. Notes for the review submission (draft)

Text is in `store/metadata.json` `review.notes`; contact and demo account come from env, never from the file. Draft, to be adjusted after the owner's decisions of sections 3 and 4:

- Itera is a learning app: a native shell around the web player. The review account in the Sign-in information already has access to all content.
- Open the catalog, then the program "Dominio -> Agente", tap the highlighted lesson and answer the exercises; each answer shows feedback.
- The app has no sign-up, price or purchase; accounts are created on the web.
- "Sign in with DFL" signs in with an account of DevFellowship, the company that operates Itera, through the system sign-in sheet; it is the company's own account system.
- The app asks for the camera only when the user picks "Take Photo" for the profile photo, and for no microphone, location, contacts or notification permission. Add the privacy policy URL of item 7 and the support URL of item 8 in the form.
- Add to the notes the exception chosen for 3.1.3 and the deletion route chosen for 5.1.1(v).

## 7. Gaps and routes, summary

| Gap | Route | Owner |
|---|---|---|
| No privacy policy page (`https://iterahq.dev/privacy` was the home page) | Merge and deploy the landing PR (`/privacy`), then re-check the URL | human reads the legal text and merges |
| Support URL has no contact | Same landing PR (`/support`); `supportUrl` already points to it | human merges |
| Demo account that passes the subscription gate | Create it, add `ASC_REVIEW_DEMO_USER` and `ASC_REVIEW_DEMO_PASSWORD` and the four `ASC_REVIEW_CONTACT_*` secrets | human |
| App Privacy label | Tick the boxes of section 2b in App Store Connect | human |
| Native fingerprint changed by the privacy manifest | One new iOS production build (counter first), then `push` with `build_number` | human starts the build |
| 4.8: "Entrar com DFL" under an individual team | Add Sign in with Apple, or drop the DFL button in the shell, or accept the exception risk | Tainan |
| 5.1.1(v): no deletion on the web | Reading (a) with a support address, or build deletion (b) | Tainan, then a plan task |
| 3.1.3 exception for access sold on the web | Name the exception in the notes; align the landing page | Tainan |
| 4.2: mostly a WebView | Explain in the notes; add one native capability; first native route | Tainan |
| Avatar picker may offer the camera | `NSCameraUsageDescription` added; confirm on the new build that "Take Photo" opens the camera | developer, on a device |
| Age rating questions added by Apple in 2025 | Complete once in the UI, confirm with `status` | human |
| Screenshots of the real review account | The script takes them from any account (`store-screenshots.mjs`); re-run with the review account to refresh | developer |
