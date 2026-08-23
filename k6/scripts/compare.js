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
const { target, environment, scenario } = current.metadata;

// 2. Locate baseline file using target + environment + scenario identity
const baselineFileName = `${target}_${environment}_${scenario}_baseline.json`;
const baselinePath = path.join(baselinesDir, baselineFileName);

let comparisonResult = null;
let comparisonMd = '';

if (fs.existsSync(baselinePath)) {
  console.log(`[Pulse Comparison] Loading baseline configuration: ${baselineFileName}`);
  try {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    // Verify compatibility (target + environment + scenario check)
    const isTargetCompatible = baseline.metadata && baseline.metadata.target === target;
    const isEnvCompatible = baseline.metadata && baseline.metadata.environment === environment;
    const isScenarioCompatible = baseline.metadata && baseline.metadata.scenario === scenario;

    if (!isTargetCompatible || !isEnvCompatible || !isScenarioCompatible) {
      const baseTarget = baseline.metadata ? baseline.metadata.target : 'unknown';
      const baseEnv = baseline.metadata ? baseline.metadata.environment : 'unknown';
      const baseScenario = baseline.metadata ? baseline.metadata.scenario : 'unknown';
      
      console.warn(`[Pulse Comparison Warning] Baseline target/environment/scenario (${baseTarget}/${baseEnv}/${baseScenario}) is incompatible with current run (${target}/${environment}/${scenario}). Skipping comparison.`);
      
      comparisonMd = `
### ⚠️ Baseline Comparison Skipped
- **Metadata Mismatch:** Baseline target/environment/scenario (\`${baseTarget}\` / \`${baseEnv}\` / \`${baseScenario}\`) is incompatible with current run (\`${target}\` / \`${environment}\` / \`${scenario}\`).
`;
    } else {
      // Safe metrics extraction
      const getMetric = (obj, pathArray) => {
        let currentObj = obj;
        for (const p of pathArray) {
          if (currentObj === undefined || currentObj === null) return undefined;
          currentObj = currentObj[p];
        }
        return currentObj;
      };

      const currP95 = getMetric(current, ['metrics', 'p95Latency']);
      const baseP95 = getMetric(baseline, ['metrics', 'p95Latency']);
      
      const currP99 = getMetric(current, ['metrics', 'p99Latency']);
      const baseP99 = getMetric(baseline, ['metrics', 'p99Latency']);
      
      const currFail = getMetric(current, ['metrics', 'failureRate']);
      const baseFail = getMetric(baseline, ['metrics', 'failureRate']);
      
      const currThroughput = getMetric(current, ['metrics', 'throughput']);
      const baseThroughput = getMetric(baseline, ['metrics', 'throughput']);

      // Comparison metric helper (5% variance threshold, safe for NaN/missing metrics)
      const compareMetric = (currVal, baseVal, higherIsBetter = false) => {
        if (currVal === undefined || currVal === null || isNaN(currVal) ||
            baseVal === undefined || baseVal === null || isNaN(baseVal)) {
          return { diffPercent: null, status: 'Unchanged' };
        }
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

      const p95Comp = compareMetric(currP95, baseP95);
      const p99Comp = compareMetric(currP99, baseP99);
      const failComp = compareMetric(currFail, baseFail);
      const throughputComp = compareMetric(currThroughput, baseThroughput, true);

      comparisonResult = {
        baselineTimestamp: baseline.metadata ? baseline.metadata.timestamp : 'unknown',
        metrics: {
          p95Latency: { current: currP95, baseline: baseP95, diffPercent: p95Comp.diffPercent, status: p95Comp.status },
          p99Latency: { current: currP99, baseline: baseP99, diffPercent: p99Comp.diffPercent, status: p99Comp.status },
          failureRate: { current: currFail, baseline: baseFail, diffPercent: failComp.diffPercent, status: failComp.status },
          throughput: { current: currThroughput, baseline: baseThroughput, diffPercent: throughputComp.diffPercent, status: throughputComp.status }
        }
      };

      const getStatusEmoji = (status) => {
        if (status === 'Improved') return '✅ Improved';
        if (status === 'Regressed') return '❌ Regressed';
        return '➖ Unchanged';
      };

      const formatDiff = (diffPercent) => {
        if (diffPercent === null || diffPercent === undefined) return 'N/A';
        if (Math.abs(diffPercent) < 0.01) return '0.00%';
        return `${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(2)}%`;
      };

      const formatVal = (val, formatter) => {
        if (val === undefined || val === null || isNaN(val)) return 'N/A';
        return formatter(val);
      };

      const formatMs = (v) => `${v.toFixed(2)} ms`;
      const formatThroughput = (v) => `${v.toFixed(2)} req/sec`;
      const formatFail = (v) => `${(v * 100).toFixed(2)}%`;

      const diffFailStr = () => {
        if (currFail === undefined || currFail === null || baseFail === undefined || baseFail === null) return 'N/A';
        if (currFail === baseFail) return '0.00%';
        const diffVal = (currFail - baseFail) * 100;
        return `${diffVal > 0 ? '+' : ''}${diffVal.toFixed(2)}%`;
      };

      comparisonMd = `
### 📊 Baseline Comparison
Compared against baseline established on **${baseline.metadata ? baseline.metadata.timestamp : 'unknown'}**:

| Metric | Current Run | Baseline | Difference | Status |
| :--- | :---: | :---: | :---: | :---: |
| **p95 Latency** | ${formatVal(currP95, formatMs)} | ${formatVal(baseP95, formatMs)} | ${formatDiff(p95Comp.diffPercent)} | ${getStatusEmoji(p95Comp.status)} |
| **p99 Latency** | ${formatVal(currP99, formatMs)} | ${formatVal(baseP99, formatMs)} | ${formatDiff(p99Comp.diffPercent)} | ${getStatusEmoji(p99Comp.status)} |
| **Throughput** | ${formatVal(currThroughput, formatThroughput)} | ${formatVal(baseThroughput, formatThroughput)} | ${formatDiff(throughputComp.diffPercent)} | ${getStatusEmoji(throughputComp.status)} |
| **Failure Rate** | ${formatVal(currFail, formatFail)} | ${formatVal(baseFail, formatFail)} | ${diffFailStr()} | ${getStatusEmoji(failComp.status)} |
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
  console.log(`[Pulse Comparison] No baseline file found for target "${target}" (environment: "${environment}", scenario: "${scenario}").`);
  comparisonMd = `
### ℹ️ Baseline Comparison
- **No baseline file found** for target \`${target}\`, environment \`${environment}\`, and scenario \`${scenario}\`.
- To establish a baseline, copy this run's JSON report into the baselines folder:
  \`\`\`bash
  copy k6\\reports\\performance_report.json k6\\baselines\\${target}_${environment}_${scenario}_baseline.json
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
