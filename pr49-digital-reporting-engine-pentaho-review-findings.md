# Review findings — PR #49: inline report images from the digital content service

| | |
| --- | --- |
| **Repository** | `uk-digital/digital-reporting-engine-pentaho` |
| **Pull request** | https://code.ssnc.dev/uk-digital/digital-reporting-engine-pentaho/pull/49 |
| **Head** | `dc7f8c5` (`feature/logo-url-support`) |
| **Base** | `develop` @ `28bb94f` (indexed, verified current) |
| **Diff** | 21 files, +451 / −39, single commit |
| **Stack** | Java 25, Spring Boot 4.1, Pentaho SDK 11.0.0.0-237 |
| **Review date** | 2026-10-07 |

Method: full diff read; CodeGraph overlay compare (`documentationDrift`, `findLiteral`) plus cross-repo `findLiteral` (k8s-apps-fsi-uk, terraform-environments, digital-reporting-service) and `testsFor`; 18 adversarial scratch tests executed against real objects (real `MasterReport` + Pentaho elements, real `RestClient` + JDK `HttpServer`, real startup listener with a logback capture) in the PR-head worktree. Scratch suite preserved at `/var/folders/jn/y8p5cqhx31b2n_6z3c0fbl9c0000gp/T/opencode/pr49-scratch/` (18 tests, all green).

The core feature works as claimed, proven with real objects: image bytes inlined into the content-field's static value, the field binding removed, and every fail-fast branch behaves fail-closed. The findings below are ranked by consequence, not by category.

---

## 1. Blocker — every Vault secret in the pod log on every non-prod boot

**Where:** `src/main/java/com/ssnc/digital/reporting/engine/pentaho/DigitalReportingEnginePentahoApplication.java:42-57` (listener registered at `:28`)

The new `ApplicationEnvironmentPreparedListener` logs every property name and value of every enumerable property source at `log.info` whenever the `prod` profile is not active. Spring's `StandardEnvironment` registers `systemEnvironment` and `systemProperties` as enumerable sources, and the engine's k8s deployments inject **six Vault-sourced secrets as container env vars**:

- `SPRING_KAFKA_PROPERTIES_SASL_JAAS_CONFIG`
- `SPRING_DATASOURCE_PASSWORD`
- `AP_ADVISER_MANAGEMENT_PASSWORD`
- `DIGITAL_CONFIG_APPUSER_PASSWORD`
- `DIGITAL_AUDIT_API_PASSWORD`
- `DWH_REPORTING_PASSWORD`

Evidence (k8s-apps-fsi-uk, `fsi-uk-kea-dev/digital-reporting-engine-pentaho/patch-deployment.yaml:20-62`, `valueFrom.secretKeyRef`; the same shape exists for stage, qat, lptest, lptestuae):

```yaml
- name: SPRING_DATASOURCE_PASSWORD
  valueFrom:
    secretKeyRef:
      key: password
      name: digital-reporting-engine-pentaho-db-dev
```

with `SPRING_PROFILES_ACTIVE: dev` — so the `prod`-only exclusion does not protect any environment that is actually running this listener today. Dev, qat, stage, lptest and lptestuae are real shared clusters with real Vault credentials.

**Scratch-run proof:** the actual listener, invoked against a real `StandardEnvironment` carrying `spring.datasource.password=SUPER-SECRET-123`, produced a log event whose formatted message contains `SUPER-SECRET-123` verbatim. (Scratch suite: `ScratchStartupListenerTest`.)

**Recommendation:** remove the listener, or gate it to the `local` profile **and** filter out secret-shaped keys (`password`, `secret`, `token`, `key`, `sasl`, `jaas`). Never log values; names alone carry the same debugging value. Rule violated: *nothing secret reaches a log*.

---

## 2. Major — SSRF: the URL branch fetches arbitrary hosts from a request-controlled value

**Where:** `src/main/java/com/ssnc/digital/reporting/engine/pentaho/utils/ImageContentLoader.java:54-79` (URL fetch at `:39-51`)

The value bound to an image content-field comes from report request parameters and is treated as trusted routing input: anything that is not a slug is parsed as a URL and, if `http`/`https`, fetched. There is no host allowlist, no private/link-local/loopback address block, and the default client (no HTTP client library on the classpath → `RestClient.create()` resolves to `JdkClientHttpRequestFactory`) follows redirects by default. The fetched bytes are then inlined into the generated report output.

**Scratch-run proof:**

```
apply("http://127.0.0.1:9/latest/meta-data/iam/security-credentials/")
-> ImageContentLoadingException
   cause=ResourceAccessException: Connect to http://127.0.0.1:9 failed: Connection refused
```

The engine **dialed the arbitrary host**. On an EKS node the same code path reaches `169.254.169.254` and inlines the node role's temporary credentials into a PDF the report requester can open — and even where the response is unreadable it remains a blind probe of internal services.

The slug route validates at the trust boundary (shape, length 1–128, charset); the URL route needs equivalent boundary validation:

- allowlist the target hosts (ideally: only the content service, and route by slug),
- block private/link-local/loopback/unique-local ranges and pin DNS at resolution time,
- disable redirect following,
- cap the response size (see finding 3),
- reject embedded credentials.

Note also `ImageContentLoader.java:49`: exception messages log the full URL, and a query string can carry tokens — log the slug/host, not the full value.

**Test that must ship with the fix:** an assertion that a metadata-style or private-range URL is *rejected without a connection attempt*; the scratch suite's `arbitraryHost_connectionIsAttempted_ssrfSurface` is the shape of the test that fails today.

---

## 3. Major — no timeout, no size cap: report generation can be pinned indefinitely

**Where:** `src/main/java/com/ssnc/digital/reporting/engine/pentaho/utils/ImageContentLoader.java:39-56`; `DigitalContentClientConfig.java:16-24`

`urlContentLoader` fetches via `RestClient.create()` with **no connect/read/request timeout configured** (JDK HttpClient with no request timeout is unbounded) and reads the whole body with `body(byte[].class)`; the slug route buffers via `Resource.getContentAsByteArray()`. Neither path caps the response size, and neither does the `content` group configurer in `DigitalContentClientConfig`.

Consequences, concretely:

- A slow or hanging image URL pins an async generation slot **forever** — pool is 10 core / 50 max / queue 100 (`TaskExecConfig`), so a handful of hostile or merely broken image URLs puts the engine at capacity (`TaskRejectedException` → `statusReporter.rejected`) for every tenant.
- A large "image" is buffered whole into heap → OOM kills the engine.

**Recommendation:** configure connect/read timeouts and a max-bytes limit on both routes, and timeouts in the group configurer for the content client. This is the specific availability trap, not a generic "is it fast" note.

---

## 4. Moderate — X-Request-ID correlates with nothing under the default transport

**Where:** `src/main/java/com/ssnc/digital/reporting/engine/pentaho/config/DigitalContentClientConfig.java:21`

```java
.defaultRequest(r -> r.header(CustomHeaders.X_REQUEST_ID, CustomAttributes.requestId().toString()));
```

`CustomAttributes.requestId()` reads `RequestContextHolder`; there is no request context on a Kafka listener thread or on the async generation thread, so it falls back to `UUID::randomUUID`. The `defaultRequest` consumer runs **per request** (Spring Framework 7 `DefaultRestClient.java:204-206`), so every download generates a fresh id.

**Scratch-run proof:** two consecutive downloads on a context-less thread sent two different random UUIDs (`0c6b6adc-…`, `f87e1493-…`). With a request context present, the original id propagates correctly (the `RequestContextTaskDecorator` in `TaskExecConfig` copies request attributes and `RequestTrackingFilter` binds `REQUEST_ID`).

So the header is correct under the REST orchestrator transport and pure noise under **kafka** — which PR #48 just made the default (`DIGITAL_REPORTING_ORCHESTRATOR_TRANSPORT=kafka` in the dev deployment). The PR body advertises "propagating X-Request-ID"; under the default transport, the id matches neither the engine's new MDC `executionId` nor anything upstream, and the content service's request tracing cannot be joined back.

This copies an existing pattern from the sibling `DigitalReportingClientConfig` (pre-existing defect), but it lands in a world where the default transport makes it inert. **Recommendation:** derive the header from the MDC `EXEC_ID` (which this same PR now reliably sets), falling back to the request attribute when present.

---

## 5. Moderate — the entire guard surface ships with no test that can fail

**Where:** `PentahoReportDefinitionPreProcessorTest` (visitor is a Mockito mock), `PentahoSqlReportRenderIT` (loader is a `@MockitoBean` stub); scratch-verified via CodeGraph `testsFor`: `ImageContentLoader` — only `PentahoSqlReportRenderIT`, `methodsTouched: 0`; `ReportDefinitionVisitor` — only the mock-based unit test.

Nothing in the suite exercises the routing, scheme rejection, trimming, slug boundary, or empty-content branches. Delete `ImageContentLoader`'s scheme check or the empty-bytes guard today and every test stays green. This is the exact shape of test the security rules require to ship with the guard — a test that **fails without it**.

The scratch suite at `/var/folders/jn/y8p5cqhx31b2n_6z3c0fbl9c0000gp/T/opencode/pr49-scratch/` is a ready-made seed (18 tests, plain JUnit; the server-bound cases use the JDK's built-in `HttpServer` and run in ~1 s):

| verified behavior | test |
| --- | --- |
| blank source → fail fast | `blankSource_failsFast` |
| slug routes to the content client | `slug_routesToContentClient` |
| slug boundary 128 accepted / 129 rejected | `slugBoundary_128_accepted_129_rejected` |
| http URL fetched by the real RestClient | `httpUrl_fetchedByRealRestClient` |
| uppercase scheme loads (RFC 3986) | `uppercaseScheme_rfc3986SaysCaseInsensitive_soItMustLoad` |
| ftp/file/mailto rejected without fetch | `nonHttpSchemes_rejectedWithoutFetch` |
| scheme-less rejected | `noScheme_rejected` |
| arbitrary host dialed (SSRF — fails after the fix) | `arbitraryHost_connectionIsAttempted_ssrfSurface` |
| 204/empty body → null → visitor fails fast | `noContent204_yieldsNull_notAnError` |
| bytes inlined, field unbound | `visitor_inlinesBytes_andUnbindsField` |
| absent param → intended error | `visitor_paramAbsent_failsFastWithIntendedMessage` |
| non-String param → intended error (no CCE) | `visitor_paramNonString_intendedMessageOrOpaquerError` |
| empty bytes → fail fast | `visitor_emptyBytes_failsFast` |
| blank param → trimmed → fail fast | `visitor_blankParamValue_trimmedThenFailsFast` |
| unbound content-field left to the SDK | `visitor_contentFieldWithNoBinding_leftToSdk` |
| X-Request-ID uncorrelated per call (fails after fix) | `xRequestId_kafkaLikeThread_noRequestContext_uncorrelatedPerCall` |
| X-Request-ID propagates under request context | `xRequestId_withRequestContext_propagatesOriginalId` |
| startup listener writes secret values into log events (fails after fix) | `ScratchStartupListenerTest.envDumpListener_writesSecretPropertyValuesIntoLogEvents` |

---

## 6. Minor — fail-late default for a new required dependency

**Where:** `src/main/resources/application.properties:11`

```
digital.content.service.base-url=http://localhost:8080
```

That is the *reporting* service's local URL, not the content API. `@Value` requires the property, so this fallback means an environment that doesn't override it compiles, boots clean, and then fails only when the first report with an image field is generated (connection refused at generation time — fail-late, far from the cause). `local`, `test`, and `config-dev` set the real value; whether lptest/au/qat/stage configserver files define it is an open question (below). A missing-value startup failure or the dev content URL is safer than a localhost red herring.

---

## Questions — could not be settled from this repository

1. **The `config/` consolidation** (`datasources-dev.properties` → `config-dev.properties`; `datasources-local.properties` deleted; `config-local-rest.properties` added): nothing in this repo and none of the indexed repos (k8s-apps-fsi-uk, terraform-environments, digital-reporting-service) reference the old file names — confirmed by full-tree grep at the head sha plus cross-repo literal scans. **Who consumes those files by name?** If the digital-config-api serves or archives them, the rename changes what is fetched, and a consumer of `datasources-dev` / `datasources-local` now misses.
2. **Do lptest / au / qat / stage define `digital.content.service.base-url`** in their configserver-served files? If not, finding 6 fires there (image-bearing reports fail).
3. **Template blast radius of the fail-fast invariant:** the visitor hard-fails any content-field whose field binding is not a String request parameter — intended per the PR description, and the error text is right (`ReportDefinitionVisitor.java:92`). But a *pre-existing* report template whose image content-field is bound to a report parameter or a data column now fails generation, where before this change the SDK resolved it from the datarow. Has this been verified against the templates currently stored in the content service?

---

## Checked clean

- `compare base↔overlay : documentationDrift` — empty in all buckets: no documented-contract drift introduced.
- No new REST endpoints in the diff (outbound client + Kafka listener changes only) → no endpoint-gating question; the content client path `/api/v1/delivery/{slug}` matches the content API's delivery surface.
- Fail-fast is genuinely fail-closed on every boundary input exercised: blank/trimmed-to-empty values, absent parameter, **non-String parameter takes the intended error branch (no ClassCastException — hypothesis tested and disproven)**, 204-empty body → null → "No content loaded", `ftp:`/`file:`/`mailto:` rejected without fetching, scheme-less values rejected, slug length boundary exact at 128/129.
- Uppercase `HTTP://` scheme loads correctly (second tested-and-disproven hypothesis).
- The MDC change is correct: `submit` runs synchronously on the listener thread, generation is `@Async`, and `MDCTaskDecorator` carries the MDC into the worker thread; the `finally { MDC.clear() }` on the listener thread is correct hygiene.
- Content-fields with no field binding (static value) are left to the SDK untouched.

## Attribution

All six defects were visible in the diff; the strongest evidence for four of them was *running* the code, not tooling. CodeGraph's material contributions: the cross-repo literal scan that turned finding 1 from "logs properties" into "logs six Vault secrets" (it located the k8s patch-deployment and its `secretKeyRef` env vars), and `testsFor` corroborating finding 5.

## Aftercare

Overlay `digital-reporting-engine-pentaho-pr49` (`5d80ae16-4a79-38f4-9011-f7b2852da7ea`) deleted via `DELETE /api/projects/{id}`; all 11 aftercare checks PASS — overlay nodes/label/registry/worktree/refs fully gone, base intact (3,805 entities, 1,033 explanations, 9 capabilities, 39 functionalities), shared embedding cache untouched at 95,175 entries with no project-owned entries.
