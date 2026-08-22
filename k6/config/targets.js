// k6/config/targets.js

/**
 * Registry of supported API targets.
 * Each target must specify:
 * - id: unique string identifier matching the PULSE_TARGET value
 * - displayName: user-friendly label
 * - environments: environment-specific target parameters (baseUrl, apiVersion)
 * - endpoints: catalog of key paths for the target API
 * - testData: boundary values and inputs for scenarios
 */
export const targets = {
  phoenix: {
    id: 'phoenix',
    displayName: 'Phoenix API',
    environments: {
      local: {
        baseUrl: 'http://test.k6.io', // Using k6 test site for out-of-the-box local runs
        apiVersion: 'v1'
      },
      development: {
        baseUrl: 'https://phoenix-dev.api.pulse-testing.local',
        apiVersion: 'v1'
      },
      staging: {
        baseUrl: 'https://phoenix-staging.api.pulse-testing.local',
        apiVersion: 'v1'
      },
      'production-like': {
        baseUrl: 'https://phoenix.api.pulse-testing.local',
        apiVersion: 'v1'
      }
    },
    endpoints: {
      health: {
        id: 'health',
        method: 'GET',
        path: '/'
      },
      contacts: {
        id: 'contacts',
        method: 'GET',
        path: '/contacts.php'
      }
    },
    testData: {
      sampleUserId: 'usr_phoenix_1001',
      defaultLimit: 25
    }
  },
  trajectory: {
    id: 'trajectory',
    displayName: 'Trajectory API',
    environments: {
      local: {
        baseUrl: 'http://test.k6.io', // Using k6 test site for out-of-the-box local runs
        apiVersion: 'v2'
      },
      development: {
        baseUrl: 'https://trajectory-dev.api.pulse-testing.local',
        apiVersion: 'v2'
      },
      staging: {
        baseUrl: 'https://trajectory-staging.api.pulse-testing.local',
        apiVersion: 'v2'
      },
      'production-like': {
        baseUrl: 'https://trajectory.api.pulse-testing.local',
        apiVersion: 'v2'
      }
    },
    endpoints: {
      health: {
        id: 'health',
        method: 'GET',
        path: '/'
      },
      flip: {
        id: 'flip',
        method: 'GET',
        path: '/flip.php'
      }
    },
    testData: {
      sampleTrajectoryId: 'trj_trajectory_9999',
      defaultPage: 1
    }
  }
};
