# Opt-in performance checks

These synthetic benchmarks use existing Vitest tooling and never enter the
extension bundle. Regular `npm test` excludes them. No live page identifiers or
credentials are required.

For Firefox DOM snapshot retention, use `PERFORMANCE_DOM=1` with the same config
and report options. It checks 30 successful and 30 rejected results with WeakRefs
and forced GC in Node/jsdom. Native Firefox/Chrome semantics and capture timings
are measured separately with `npm run check:desktop-runtime` after building.
See [Desktop verification](../../docs/firefox-desktop-testing.md) for scope,
binary selection, metrics and manual toolbar/lifecycle checks.

```sh
PERFORMANCE_REPORT=/tmp/performance-after.json npx vitest run --config tests/performance/vitest.config.ts
```

To compare with an unchanged source snapshot, extract the baseline outside the
project so IDE duplicate-code inspections do not index a second source tree.
The project uses ignored `dev_notes/` for reports only:

```sh
performance_baseline_dir=$(mktemp -d /tmp/copy-as-context-baseline.XXXXXX)
performance_baseline_ref=main
git archive "$performance_baseline_ref" src | tar -x -C "$performance_baseline_dir"
PERFORMANCE_BASELINE_ROOT="$performance_baseline_dir" PERFORMANCE_REPORT=/tmp/performance-before.json npx vitest run --config tests/performance/vitest.config.ts
PERFORMANCE_COMPARE=/tmp/performance-before.json PERFORMANCE_REPORT=/tmp/performance-after.json npx vitest run --config tests/performance/vitest.config.ts
```

Choose a baseline ref that predates the changes being measured. The comparison
checks SHA-256 of complete prepared exports, including metrics,
across all profiles, both formats and privacy settings. Reports contain hashes,
sizes and timings. The corpus includes wide resource rows and named ancestor
chains. Scenario names describe approximate scale: each resource row also has
its own node, so the exact count exceeds the nominal scale by 20% plus the root.
Runs use five warmups, 100 samples (median/p95), or 20 samples for large trees
(median only). Run without simultaneous builds or unrelated CPU-heavy tasks.
Use `PERFORMANCE_SCENARIOS=small` and `PERFORMANCE_REPEATS=500` for an isolated
repeat when a small-case regression needs checking.
These Node timings do not measure Chrome renderer, debugger, IPC, popup paint,
Android, or total browser RAM. Treat small timing differences as noise.

For a focused AX normalization timing and retention check:

```sh
PERFORMANCE_NORMALIZATION=1 PERFORMANCE_REPORT=/tmp/normalization-after.json npx vitest run --config tests/performance/vitest.config.ts
```

Use `PERFORMANCE_BASELINE_ROOT` as above for the baseline. This harness tests
417, 10,001, and 50,001 nodes, with and without frame IDs, an identical repeated
leaf, and a conflicting repeated leaf. It records output hashes and success
status, timing after ten warmups, and heap samples across 30 calls with GC.
Compare timing only for scenarios with matching behavior; a baseline rejection
is not equivalent to successful normalization. Output hashes for successful
framed/unframed cases must match across versions. Diagnostics are silenced with
a non-retaining console stub; this does not measure Chrome console overhead.
Post-call heap is sampled with the result alive, then the result is released
before GC. First/last five retained-heap medians help identify accumulation;
small deltas include harness/runtime noise. This does not measure peak heap or
prove the absence of browser leaks. A separate series creates 30 fresh snapshots
and uses WeakRefs after an event-loop turn and forced GC to check that completed
successful/failed calls release the input records and successful output trees.
The existing export heap check below does
not exercise normalization.

For an opt-in heap check with GC exposed only in the test process:

```sh
PERFORMANCE_MEMORY=1 PERFORMANCE_REPORT=/tmp/memory-after.json npx vitest run --config tests/performance/vitest.config.ts
```

The same `PERFORMANCE_BASELINE_ROOT` option selects an unchanged baseline. This
test records heap immediately after each export and retained heap after forced
GC, for 30 repetitions. V8 allocation sampling includes collected objects and
reports estimated total allocated bytes for the series, not a memory peak.
Post-export deltas include uncollected garbage and profiler overhead and can
be affected by automatic GC. They are sampled observations, not a true peak,
allocation total, or proof that no browser memory leak exists.

After building both targets, report package sizes with the Python standard library:

```sh
npm run build
npm run build:firefox
python3 tests/performance/size-report.py /tmp/build-sizes.json
```

The ZIP metric uses fixed timestamps, deflate level 9 and includes all build files.
It is a reproducible comparison rather than a claim about a store-generated ZIP.

Open `tests/manual/performance-quality.html` in Chrome and use the unpacked
production build to check real Copy/Save, privacy, repeated captures, popup close,
and debugger release. Compare equal page states. Use popup performance traces,
background heap snapshots and Chrome Task Manager separately; inspector sessions
affect service-worker lifetime. The Performance panel may reject recording for
service-worker targets. Heap snapshots measure retained objects after collection,
not peak memory. Task Manager can miss brief spikes and reports process-level
memory that may include both the popup and background worker. Match process IDs
and do not add repeated rows from the same process. Allocation profiles identify
object allocation sources; their totals are not simultaneous peak memory.
Do not log captured page text in diagnostics.
