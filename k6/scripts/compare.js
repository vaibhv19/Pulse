// k6/scripts/compare.js
const fs = require('fs');
const path = require('path');

// Target directories
const k6Dir = path.join(__dirname, '..');
const reportsDir = path.join(k6Dir, 'reports');
const baselinesDir = path.join(k6Dir, 'baselines');

const lastRunJsonPath = path.join(reportsDir, 'last_run.json');
const lastRunMdPath = path.join(reportsDir, 'last_run.md');
const finalReportJsonPath = path.join(reportsDir, 'performance_report.json');
const finalReportMdPath = path.join(reportsDir, 'performance_report.md');

// Ensure reports and baselines directories exist
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}
if (!fs.existsSync(baselinesDir)) {
  fs.mkdirSync(baselinesDir, { recursive: true });
}

// 1. Read last run report
if (!fs.existsSync(lastRunJsonPath)) {
  console.error(`[Pulse Report Error] last_run.json not found. Please run a k6 test first.`);
  process.exit(1);
}

console.log(`[Pulse Report] Reading last execution run results...`);
const current = JSON.parse(fs.readFileSync(lastRunJsonPath, 'utf8'));
const { target, scenario } = current.metadata;

// 2. Locate baseline file
const baselineFileName = `${target}_${scenario}_baseline.json`;
const baselinePath = path.join(baselinesDir, baselineFileName);

let comparisonResult = null;
let comparisonMd = '';

if (fs.existsSync(baselinePath)) {
  console.log(`[Pulse Comparison] Loading baseline configuration: ${baselineFileName}`);
  try {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    // Verify compatibility
    if (baseline.metadata.target !== target || baseline.metadata.scenario !== scenario) {
      console.warn(`[Pulse Comparison Warning] Baseline target/scenario (${baseline.metadata.target}/${baseline.metadata.scenario}) is incompatible with current run (${target}/${scenario}). Skipping comparison.`);
      comparisonMd = `
### ⚠️ Baseline Comparison Skipped
- **Metadata Mismatch:** Baseline target/scenario (\`${baseline.metadata.target}\` / \`${baseline.metadata.scenario}\`) is incompatible with current run (\`${target}\` / \`${scenario}\`).
`;
    } else {
      // Comparison metric helper (5% variance threshold)
      const compareMetric = (currVal, baseVal, higherIsBetter = false) => {
        if (baseVal === 0) {
          return { diffPercent: 0, status: currVal === 0 ? 'Unchanged' : (higherIsBetter ? 'Improved' : 'Regressed') };
        }
        const diff = currVal - baseVal;
        const diffPercent = (diff / baseVal) * 100;
        
        if (Math.abs(diffPercent) <= 5) {
          return { diffPercent, status: 'Unchanged' };
        }
        
        if (higherIsBetter) {
          return { diffPercent, status: diffPercent > 0 ? 'Improved' : 'Regressed' };
        } else {
          return { diffPercent, status: diffPercent < 0 ? 'Improved' : 'Regressed' };
        }
      };

      const p95Comp = compareMetric(current.metrics.p95Latency, baseline.metrics.p95Latency);
      const p99Comp = compareMetric(current.metrics.p99Latency, baseline.metrics.p99Latency);
      const failComp = compareMetric(current.metrics.failureRate, baseline.metrics.failureRate);
      const throughputComp = compareMetric(current.metrics.throughput, baseline.metrics.throughput, true);

      comparisonResult = {
        baselineTimestamp: baseline.metadata.timestamp,
        metrics: {
          p95Latency: { current: current.metrics.p95Latency, baseline: baseline.metrics.p95Latency, diffPercent: p95Comp.diffPercent, status: p95Comp.status },
          p99Latency: { current: current.metrics.p99Latency, baseline: baseline.metrics.p99Latency, diffPercent: p99Comp.diffPercent, status: p99Comp.status },
          failureRate: { current: current.metrics.failureRate, baseline: baseline.metrics.failureRate, diffPercent: failComp.diffPercent, status: failComp.status },
          throughput: { current: current.metrics.throughput, baseline: baseline.metrics.throughput, diffPercent: throughputComp.diffPercent, status: throughputComp.status }
        }
      };

      const getStatusEmoji = (status) => {
        if (status === 'Improved') return '✅ Improved';
        if (status === 'Regressed') return '❌ Regressed';
        return '➖ Unchanged';
      };

      const formatDiff = (diffPercent) => {
        if (Math.abs(diffPercent) < 0.01) return '0.00%';
        return `${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(2)}%`;
      };

      comparisonMd = `
### 📊 Baseline Comparison
Compared against baseline established on **${baseline.metadata.timestamp}**:

| Metric | Current Run | Baseline | Difference | Status |
| :--- | :---: | :---: | :---: | :---: |
| **p95 Latency** | ${current.metrics.p95Latency.toFixed(2)} ms | ${baseline.metrics.p95Latency.toFixed(2)} ms | ${formatDiff(p95Comp.diffPercent)} | ${getStatusEmoji(p95Comp.status)} |
| **p99 Latency** | ${current.metrics.p99Latency.toFixed(2)} ms | ${baseline.metrics.p99Latency.toFixed(2)} ms | ${formatDiff(p99Comp.diffPercent)} | ${getStatusEmoji(p99Comp.status)} |
| **Throughput** | ${current.metrics.throughput.toFixed(2)} req/sec | ${baseline.metrics.throughput.toFixed(2)} req/sec | ${formatDiff(throughputComp.diffPercent)} | ${getStatusEmoji(throughputComp.status)} |
| **Failure Rate** | ${(current.metrics.failureRate * 100).toFixed(2)}% | ${(baseline.metrics.failureRate * 100).toFixed(2)}% | ${current.metrics.failureRate === baseline.metrics.failureRate ? '0.00%' : (current.metrics.failureRate - baseline.metrics.failureRate > 0 ? '+' : '') + ((current.metrics.failureRate - baseline.metrics.failureRate) * 100).toFixed(2) + '%'} | ${getStatusEmoji(failComp.status)} |
`;
    }
  } catch (e) {
    console.error(`[Pulse Comparison Error] Failed to read or parse baseline file ${baselineFileName}:`, e);
    comparisonMd = `
### ⚠️ Baseline Comparison Failed
- **Error:** Failed to read or parse baseline file \`${baselineFileName}\`.
`;
  }
} else {
  console.log(`[Pulse Comparison] No baseline file found for target "${target}" (scenario: "${scenario}").`);
  comparisonMd = `
### ℹ️ Baseline Comparison
- **No baseline file found** for target \`${target}\` and scenario \`${scenario}\`.
- To establish a baseline, copy this run's JSON report into the baselines folder:
  \`\`\`bash
  copy k6\\reports\\performance_report.json k6\\baselines\\${target}_${scenario}_baseline.json
  \`\`\`
`;
}

// 3. Save final reports
const finalReportJson = {
  ...current,
  comparison: comparisonResult
};

fs.writeFileSync(finalReportJsonPath, JSON.stringify(finalReportJson, null, 2), 'utf8');

// Combine last run MD and comparison MD
const currentMd = fs.readFileSync(lastRunMdPath, 'utf8');
const finalReportMd = currentMd + comparisonMd;
fs.writeFileSync(finalReportMdPath, finalReportMd, 'utf8');

console.log(`[Pulse Report] Reports successfully generated:`);
console.log(`- Human-readable: k6/reports/performance_report.md`);
console.log(`- Machine-readable: k6/reports/performance_report.json`);
