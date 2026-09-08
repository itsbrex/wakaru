mod common;

use common::{assert_eq_normalized, render_pipeline_until, render_rule};
use wakaru_core::rules::UnInfinity;

fn apply(input: &str) -> String {
    render_rule(input, UnInfinity::new)
}

#[test]
fn transforms_one_div_zero_to_infinity() {
    // Reused from packages/unminify/src/transformations/__tests__/un-infinity.spec.ts
    let input = r#"
const a = 1 / 0;
const b = -1 / 0;
const c = 0 / 0;
const d = 99 / 0;
const e = '1' / 0;
const f = x / 0;
const g = [0 / 0, 1 / 0];
"#;
    let expected = r#"
const a = Infinity;
const b = -Infinity;
const c = 0 / 0;
const d = 99 / 0;
const e = '1' / 0;
const f = x / 0;
const g = [0 / 0, Infinity];
"#;
    let output = apply(input);
    assert_eq_normalized(&output, expected);
}

#[test]
fn skips_module_with_direct_eval() {
    // Sloppy direct `eval` can declare `Infinity` at runtime; the synthesized
    // global reference has no static proof it stays free, so the whole module
    // keeps `1 / 0` (dynamic-scope policy in docs/rewrite-assumptions.md).
    let input = r#"
function f(code) {
  eval(code);
  return 1 / 0;
}
"#;
    let output = render_pipeline_until(input, "UnInfinity");
    assert!(output.contains("1 / 0"), "{output}");
    assert!(!output.contains("Infinity"), "{output}");
}

#[test]
fn skips_module_with_with_statement() {
    let input = r#"
function f(scope) {
  with (scope) {
    log(-1 / 0);
  }
  return 1 / 0;
}
"#;
    let output = render_pipeline_until(input, "UnInfinity");
    assert!(output.contains("-1 / 0"), "{output}");
    assert!(output.contains("return 1 / 0"), "{output}");
    assert!(!output.contains("Infinity"), "{output}");
}

#[test]
fn skips_module_that_declares_infinity() {
    let input = r#"
function f(Infinity) {
  return 1 / 0;
}
const g = 1 / 0;
"#;
    let output = render_pipeline_until(input, "UnInfinity");
    assert_eq!(output.matches("1 / 0").count(), 2, "{output}");
}

#[test]
fn indirect_eval_does_not_block() {
    let input = r#"
function f(code) {
  (0, eval)(code);
  return 1 / 0;
}
"#;
    let output = render_pipeline_until(input, "UnInfinity");
    assert!(output.contains("return Infinity"), "{output}");
}

#[test]
fn known_eval_source_blocks_only_when_it_mentions_infinity() {
    let unrelated = r#"
const crypto = eval("require('crypto')");
const a = 1 / 0;
"#;
    let output = render_pipeline_until(unrelated, "UnInfinity");
    assert!(output.contains("const a = Infinity"), "{output}");

    let mentions = r#"
eval("var Infinity = 1");
const a = 1 / 0;
"#;
    let output = render_pipeline_until(mentions, "UnInfinity");
    assert!(output.contains("const a = 1 / 0"), "{output}");
}
