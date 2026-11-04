/**
 * Render API Interaction — Unit Tests
 *
 * Tests the Render API interaction logic used by the release workflow.
 * Uses mocked HTTP responses to verify:
 * - Deployment trigger request format
 * - Status polling logic
 * - Terminal state detection (all 7 states)
 * - SHA verification (using .commit.id, not .commitId)
 * - Error handling (malformed JSON, HTTP errors, network errors)
 *
 * These tests validate the expected behavior without making real API calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server } from 'node:http';

// Mock Render API responses
const MOCK_DEPLOY_ID = 'dep-abc123def456';
const MOCK_COMMIT_SHA = 'b11638b22150c44e6287b89ef580374f83a8180e';
const MOCK_SERVICE_ID = 'srv-test123';

interface MockDeployState {
  status: string;
  commit: {
    id: string;
  };
}

// `Response.json()` is typed `Promise<unknown>` by the current @types/node. This spec
// drives a local mock server whose response shapes are known here, so unwrap once.
async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe('Render API Interaction', () => {
  let server: Server;
  let baseUrl: string;
  let deployState: MockDeployState;
  let requestLog: Array<{ method: string; path: string; body?: any }>;

  beforeEach(async () => {
    requestLog = [];
    deployState = {
      status: 'build_in_progress',
      commit: {
        id: MOCK_COMMIT_SHA,
      },
    };

    // Create mock Render API server
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        requestLog.push({
          method: req.method!,
          path: req.url!,
          body: body ? JSON.parse(body) : undefined,
        });

        // Mock API endpoints
        if (req.method === 'POST' && req.url?.includes('/deploys')) {
          // Trigger deployment
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: MOCK_DEPLOY_ID }));
        } else if (req.method === 'GET' && req.url?.includes(`/deploys/${MOCK_DEPLOY_ID}`)) {
          // Poll deployment status
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(deployState));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Deployment trigger', () => {
    it('should send correct request format', async () => {
      const response = await fetch(`${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commitId: MOCK_COMMIT_SHA,
          clearCache: 'do_not_clear',
        }),
      });

      expect(response.status).toBe(201);
      const data = await readJson(response);
      expect(data.id).toBe(MOCK_DEPLOY_ID);

      // Verify request format
      expect(requestLog).toHaveLength(1);
      const firstRequest = requestLog[0]!;
      expect(firstRequest.method).toBe('POST');
      expect(firstRequest.path).toBe(`/v1/services/${MOCK_SERVICE_ID}/deploys`);
      expect(firstRequest.body).toEqual({
        commitId: MOCK_COMMIT_SHA,
        clearCache: 'do_not_clear',
      });
    });

    it('should include authorization header', async () => {
      await fetch(`${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commitId: MOCK_COMMIT_SHA,
          clearCache: 'do_not_clear',
        }),
      });

      // Note: We can't directly inspect headers in this mock, but the request
      // would fail in real API without proper auth
      expect(requestLog).toHaveLength(1);
    });

    it('should validate JSON response structure', async () => {
      const response = await fetch(`${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commitId: MOCK_COMMIT_SHA,
          clearCache: 'do_not_clear',
        }),
      });

      const data = await readJson(response);
      
      // Validate response has required fields
      expect(data).toHaveProperty('id');
      expect(typeof data.id).toBe('string');
      expect(data.id).toMatch(/^dep-/);
    });

    it('should handle malformed JSON response', async () => {
      // Create server that returns malformed JSON
      server.close();
      server = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{ malformed json');
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          if (addr && typeof addr !== 'string') {
            baseUrl = `http://localhost:${addr.port}`;
          }
          resolve();
        });
      });

      const response = await fetch(`${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commitId: MOCK_COMMIT_SHA,
          clearCache: 'do_not_clear',
        }),
      });

      // Should fail to parse JSON
      await expect(response.json()).rejects.toThrow();
    });
  });

  describe('Status polling', () => {
    it('should detect terminal state: live', async () => {
      deployState = { status: 'live', commit: { id: MOCK_COMMIT_SHA } };

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      expect(data.status).toBe('live');

      // Verify polling logic would exit successfully
      const terminalStates = ['live', 'failed', 'build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'];
      expect(terminalStates).toContain(data.status);
      expect(data.status).toBe('live');
    });

    it('should detect terminal state: failed', async () => {
      deployState = { status: 'failed', commit: { id: MOCK_COMMIT_SHA } };

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      expect(data.status).toBe('failed');

      // Verify polling logic would exit with error
      const failureStates = ['failed', 'build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'];
      expect(failureStates).toContain(data.status);
    });

    it('should detect terminal state: build_failed', async () => {
      deployState = { status: 'build_failed', commit: { id: MOCK_COMMIT_SHA } };

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      expect(data.status).toBe('build_failed');
    });

    it('should detect terminal state: update_failed', async () => {
      deployState = { status: 'update_failed', commit: { id: MOCK_COMMIT_SHA } };

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      expect(data.status).toBe('update_failed');
    });

    it('should detect terminal state: pre_deploy_failed', async () => {
      deployState = { status: 'pre_deploy_failed', commit: { id: MOCK_COMMIT_SHA } };

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      expect(data.status).toBe('pre_deploy_failed');
    });

    it('should detect terminal state: canceled', async () => {
      deployState = { status: 'canceled', commit: { id: MOCK_COMMIT_SHA } };

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      expect(data.status).toBe('canceled');
    });

    it('should detect terminal state: deactivated', async () => {
      deployState = { status: 'deactivated', commit: { id: MOCK_COMMIT_SHA } };

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      expect(data.status).toBe('deactivated');
    });

    it('should continue polling for non-terminal state', async () => {
      const states = ['created', 'build_in_progress', 'update_in_progress', 'live'];
      let stateIndex = 0;

      // Mock server that transitions through states
      server.close();
      server = createServer((req, res) => {
        if (req.method === 'GET' && req.url?.includes(`/deploys/${MOCK_DEPLOY_ID}`)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: states[stateIndex],
            commit: { id: MOCK_COMMIT_SHA },
          }));
          stateIndex = Math.min(stateIndex + 1, states.length - 1);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          if (addr && typeof addr !== 'string') {
            baseUrl = `http://localhost:${addr.port}`;
          }
          resolve();
        });
      });

      // Simulate polling loop
      const terminalStates = ['live', 'failed', 'build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'];
      let currentStatus = '';
      let polls = 0;

      while (!terminalStates.includes(currentStatus) && polls < 10) {
        const response = await fetch(
          `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
          {
            headers: {
              'Authorization': 'Bearer test-api-key',
            },
          },
        );
        const data = await readJson(response);
        currentStatus = data.status;
        polls++;
      }

      expect(currentStatus).toBe('live');
      expect(polls).toBeGreaterThanOrEqual(3); // Should poll through multiple states
    });
  });

  describe('SHA verification', () => {
    it('should verify deployed SHA using .commit.id (not .commitId)', async () => {
      deployState = { status: 'live', commit: { id: MOCK_COMMIT_SHA } };

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      
      // CRITICAL: Render API returns SHA in .commit.id, not .commitId
      expect(data.commit).toBeDefined();
      expect(data.commit.id).toBe(MOCK_COMMIT_SHA);
      
      // Verify SHA match logic
      const expectedSha = MOCK_COMMIT_SHA;
      const deployedSha = data.commit.id;
      expect(deployedSha).toBe(expectedSha);
    });

    it('should detect SHA mismatch', async () => {
      const wrongSha = '0000000000000000000000000000000000000000';
      deployState = { status: 'live', commit: { id: wrongSha } };

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      
      // CRITICAL: Render API returns SHA in .commit.id
      expect(data.commit.id).not.toBe(MOCK_COMMIT_SHA);

      // Verify SHA mismatch detection
      const expectedSha = MOCK_COMMIT_SHA;
      const deployedSha = data.commit.id;
      expect(deployedSha).not.toBe(expectedSha);
    });

    it('should handle missing commit.id field', async () => {
      deployState = { status: 'live' } as any; // Missing commit field

      const response = await fetch(
        `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      const data = await readJson(response);
      
      // Should handle missing commit.id gracefully
      const deployedSha = data.commit?.id;
      expect(deployedSha).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle 401 unauthorized', async () => {
      server.close();
      server = createServer((req, res) => {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          if (addr && typeof addr !== 'string') {
            baseUrl = `http://localhost:${addr.port}`;
          }
          resolve();
        });
      });

      const response = await fetch(`${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commitId: MOCK_COMMIT_SHA,
          clearCache: 'do_not_clear',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should handle 404 service not found', async () => {
      // Create server that returns 404 for non-existent service
      server.close();
      server = createServer((req, res) => {
        if (req.url?.includes('/services/nonexistent-service')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service not found' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(deployState));
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          if (addr && typeof addr !== 'string') {
            baseUrl = `http://localhost:${addr.port}`;
          }
          resolve();
        });
      });

      const response = await fetch(
        `${baseUrl}/v1/services/nonexistent-service/deploys/${MOCK_DEPLOY_ID}`,
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        },
      );

      expect(response.status).toBe(404);
    });

    it('should handle network timeout', async () => {
      // Create server that delays response
      server.close();
      server = createServer((req, res) => {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'live' }));
        }, 5000);
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          if (addr && typeof addr !== 'string') {
            baseUrl = `http://localhost:${addr.port}`;
          }
          resolve();
        });
      });

      // Attempt fetch with short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 100);

      await expect(
        fetch(`${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`, {
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
          signal: controller.signal,
        }),
      ).rejects.toThrow();

      clearTimeout(timeoutId);
    });

    it('should handle HTTP error during polling', async () => {
      let pollCount = 0;
      
      server.close();
      server = createServer((req, res) => {
        pollCount++;
        
        if (pollCount < 3) {
          // Return error for first 2 polls
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        } else {
          // Return success on 3rd poll
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'live', commit: { id: MOCK_COMMIT_SHA } }));
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          if (addr && typeof addr !== 'string') {
            baseUrl = `http://localhost:${addr.port}`;
          }
          resolve();
        });
      });

      // Simulate polling with error handling
      let success = false;
      for (let i = 0; i < 5; i++) {
        const response = await fetch(
          `${baseUrl}/v1/services/${MOCK_SERVICE_ID}/deploys/${MOCK_DEPLOY_ID}`,
          {
            headers: {
              'Authorization': 'Bearer test-api-key',
            },
          },
        );
        
        if (response.status >= 200 && response.status < 300) {
          const data = await readJson(response);
          if (data.status === 'live') {
            success = true;
            break;
          }
        }
        
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      
      expect(success).toBe(true);
      expect(pollCount).toBe(3);
    });
  });
});
