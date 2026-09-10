# Learning: what moved the needle in the September 2026 performance round, and what did not

**TL;DR — Three changes were kept: move untouched statements instead of
cloning them when a rule rebuilds a statement list, run a cheap local shape
check before building a whole-module `BindingUseIndex`, and install mimalloc
in the CLI binary. Together they cut end-to-end time on medium and large
bundles by roughly 35–40% on an Apple M2 Max, with byte-identical output.
Three ideas were tried and rejected: skipping the index for temporary-binding
proofs, an esbuild AST handoff (and its parallel-emit fallback), and
reordering the `SimplifySequence2` side-effect check. Do not re-measure
these without a new angle. Measure with alternating AB/BA runs; sequential
batches produced 2–3% "gains" that vanished when the order was alternated.**

## What worked

**1. Move, don't clone, when rebuilding statement lists.** `UnObjectRest`
rebuilt every enclosing statement list with `iter().cloned()` and
`stmt.clone()`, so a deeply nested function was deep-copied once per nesting
level even when nothing in it changed. Consuming the list with an owning
iterator and moving unchanged statements removed 8–9% of end-to-end time on
medium bundles by itself. `IntoIter::as_slice()` keeps the original suffix
available for look-ahead proofs, so no proof logic changed. Any rule that
rebuilds `Vec<Stmt>` or `Vec<ModuleItem>` with clones is a candidate for the
same treatment; a regression test can pin it by comparing `*const Function`
addresses before and after the rule.

**2. Prove "nothing to do" before building analysis.** `UnEsm` runs three
times per module and built a full `BindingUseIndex` plus two CommonJS evidence
collectors on every run, including on modules already converted to ESM. The
resolver-aware unresolved-name inventory already says whether `require`,
`exports`, or `module` appear; gating the CommonJS proofs on it, and putting
a `windows(2)` or single-declarator pre-check in front of the three pre-pass
helpers, removed about 38% of index builds. A second traversal that built a
legacy occurrence-count map inside every index was moved to its only consumer
(`BindingFacts`). Accumulated `UnEsm` time on the largest bundle dropped by
about 70%. The esbuild ownership graph's per-declaration reference and write
queries are independent and now run on the Rayon pool with the caller's SWC
`GLOBALS` installed on each worker; a test pins identical maps for one and
four workers.

**3. mimalloc in the CLI.** A native CPU sample showed the shared cost that
rule-level traces attribute to whichever rule happens to allocate: macOS
small-object `malloc`/`free`. Installing `mimalloc::MiMalloc` as the global
allocator in `crates/cli/src/main.rs` alone removed 26–30% of remaining time
on the larger bundles, at the cost of 11–14% more peak RSS. The allocator is
deliberately confined to the executable; the `wakaru` façade, core, and WASM
crates leave the choice to their callers. swc's own `swc_malloc` makes the
same choice on the platforms Wakaru ships to; its jemalloc and system-allocator
fallbacks exist for armv7 and musl, which Wakaru does not build.

## What did not work

**Skipping the index for temporary-binding proofs.** Collecting uninitialized
binding IDs during the legacy count traversal and skipping the full use-site
index when only hoisted `var` temporaries exist cut index builds by another
31%. Accumulated index time barely moved and wall time did not move at all:
the skipped indexes were the cheap ones, and the expensive builds on complex
modules survived. Lesson: reduce the cost of the surviving expensive calls,
not the call count. The equivalence oracle (19 shapes covering shadowing,
redeclaration, switch, for-in/of, class bodies, destructuring defaults) was
useful and is worth reviving if the expensive path is ever attacked.

**esbuild AST handoff.** The idea was to hand recovered modules to the rule
pipeline as ASTs instead of printing and reparsing. Two facts killed it before
implementation: the intermediate print/reparse measured far smaller than the
stage-level intake timing suggested, and esbuild assembles CommonJS cache
wrappers, ESM init guards, export storage, and redirects partly as strings, so
a structured handoff needs correct resolver identity, relative span ordering
for TDZ proofs, raw-output materialization, and source-map-mode behavior. The
webpack/Metro sidecar is the right driver boundary but does not cover those.
A bounded parallel-emit fallback did not compile: `Lrc<SourceMap>` is not
`Sync` under the workspace's SWC feature set, and changing that would widen
the change past the saving.

**Reordering the `SimplifySequence2` side-effect check.** Moving the existing
side-effect check ahead of the observable-read proofs passed its tests and
measured within noise on seven alternating pairs. Reverted.

## Measurement rules that mattered

- Alternate AB/BA and compare within one method. Serial hyperfine batches
  drifted with machine conditions and manufactured a 2.5% gain and a 3%
  regression that both disappeared under alternation.
- Keep outliers in the data and report medians alongside means.
- Treat accumulated per-rule durations as diagnostic sums across parallel
  workers, never as wall-clock stage time.
- Gate every candidate on identical output filenames and bytes across every
  benchmark input before looking at timing.
- Profile after each retained change; the allocator only became visible once
  the rule-level hot spots were gone.

## Remaining leads

After these changes the largest accumulated rule sums on the biggest bundle
were `SimplifySequence2` and `SmartRename`, followed by bundle intake and
output writing. None of those was changed in this round.
