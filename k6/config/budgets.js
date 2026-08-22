// k6/config/budgets.js

/**
 * Registry of performance budgets for Pulse targets and scenarios.
 * 
 * Resolution Priority:
 * 1. Default Framework Budget
 * 2. Scenario-specific target budget
 * 3. Environment-specific override (inside target scenario context)
 * 4. Runtime Overrides (PULSE_BUDGET_LATENCY, PULSE_BUDGET_FAILURES)
 */
export const budgets = {
  // 1. Framework Defaults (fallback)
  default: {
    p95Latency: 2000,      // ms: 95% of request durations must be under 2s
    maxFailureRate: 0.01   // 1%: http_req_failed rate must be under 1%
  },
  
  // Target & Scenario Specific Budgets
  targets: {
    phoenix: {
      smoke: {
        p95Latency: 1500,
        maxFailureRate: 0.01,
        environments: {
          staging: {
            p95Latency: 1000
          }
        }
      },
      load: {
        p95Latency: 1800,
        maxFailureRate: 0.02,
        environments: {
          staging: {
            p95Latency: 1200
          }
        }
      },
      stress: {
        p95Latency: 5000,
        maxFailureRate: 0.10,
        environments: {
          staging: {
            p95Latency: 4000
          }
        }
      }
    },
    trajectory: {
      smoke: {
        p95Latency: 1500,
        maxFailureRate: 0.01,
        environments: {
          staging: {
            p95Latency: 1200
          }
        }
      },
      load: {
        p95Latency: 1800,
        maxFailureRate: 0.02,
        environments: {
          staging: {
            p95Latency: 1500
          }
        }
      },
      stress: {
        p95Latency: 5000,
        maxFailureRate: 0.10,
        environments: {
          staging: {
            p95Latency: 4000
          }
        }
      }
    }
  }
};
