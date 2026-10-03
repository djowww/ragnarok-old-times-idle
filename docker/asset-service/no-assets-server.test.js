import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNoAssetsServer } from './no-assets-server.js';

test('missing client data returns a clear HTTP diagnostic', async (t) => {
	const server = createNoAssetsServer();
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});

	t.after(async () => {
		await new Promise((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	});

	const { port } = server.address();
	const response = await fetch(`http://127.0.0.1:${port}/api/health`);
	const body = await response.text();

	assert.equal(response.status, 503);
	assert.match(response.headers.get('content-type'), /^text\/plain/);
	assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3338');
	assert.match(body, /DATA\.INI/);
	assert.match(body, /client-data\//);

	const preflight = await fetch(`http://127.0.0.1:${port}/batch`, { method: 'OPTIONS' });
	assert.equal(preflight.status, 204);
	assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:3338');
	assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
});
