// Checks the built node against Wiredesk's OpenAPI spec: every operation is a
// real endpoint, every field it sends is a documented parameter of that
// endpoint, every required parameter has a field, and every endpoint but
// the agent-onboarding ones is offered. Run with `npm test` (it builds first).
//
// The spec lives in the Wiredesk monorepo; outside it these tests skip.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const specUrl = new URL('../../../apps/docs/api-reference/openapi.json', import.meta.url);
const skip = existsSync(specUrl) ? false : 'openapi.json is not here (outside the monorepo)';

/** `{x}` and `{{ … }}` both become `{}`, so a template and an expression compare. */
const normalize = (path) =>
	path
		.replace(/^=/, '')
		.replace(/\{\{.*?\}\}/g, '{}')
		.replace(/\{[a-z_]+\}/g, '{}');

function loadSpec() {
	const spec = JSON.parse(readFileSync(specUrl, 'utf8'));
	const resolve = (value) =>
		value && value.$ref
			? value.$ref
					.split('/')
					.slice(1)
					.reduce((at, key) => at[key], spec)
			: value;
	const endpoints = new Map();
	for (const [path, item] of Object.entries(spec.paths)) {
		for (const method of ['get', 'post', 'patch', 'delete']) {
			const op = item[method];
			if (!op) continue;
			const parameters = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(resolve);
			const body = resolve(op.requestBody)?.content?.['application/json']?.schema;
			endpoints.set(`${method.toUpperCase()} ${normalize(path)}`, {
				id: op.operationId,
				query: new Set(parameters.filter((p) => p.in === 'query').map((p) => p.name)),
				requiredQuery: parameters.filter((p) => p.in === 'query' && p.required).map((p) => p.name),
				body: new Set(Object.keys(resolve(body)?.properties ?? {})),
				requiredBody: resolve(body)?.required ?? [],
			});
		}
	}
	return endpoints;
}

/** Each operation the node offers, with what it sends. */
function nodeOperations() {
	const { Wiredesk } = require('../dist/nodes/Wiredesk/Wiredesk.node.js');
	const { properties } = new Wiredesk().description;
	const shows = (property, resource, operation) => {
		const show = property.displayOptions?.show ?? {};
		return (
			show.resource?.includes(resource) && (!show.operation || show.operation.includes(operation))
		);
	};
	const operations = [];
	for (const selector of properties.filter((p) => p.name === 'operation')) {
		const [resource] = selector.displayOptions.show.resource;
		for (const option of selector.options) {
			const { method, url } = option.routing.request;
			const query = [];
			const body = [];
			const required = { query: [], body: [] };
			let paginates = false;
			for (const property of properties.filter((p) => shows(p, resource, option.value))) {
				if (property.routing?.send?.paginate) paginates = true;
				for (const field of [
					property,
					...(property.type === 'collection' ? property.options : []),
				]) {
					const send = field.routing?.send;
					if (!send?.property) continue;
					(send.type === 'body' ? body : query).push(send.property);
					if (field === property && property.required) {
						required[send.type === 'body' ? 'body' : 'query'].push(send.property);
					}
				}
			}
			// Return All pages with `limit` and `cursor`.
			if (paginates) query.push('limit', 'cursor');
			operations.push({
				name: `${resource}.${option.value}`,
				key: `${method} ${normalize(url)}`,
				query,
				body,
				required,
			});
		}
	}
	return operations;
}

test('every operation is a documented endpoint, sending only documented fields', { skip }, () => {
	const endpoints = loadSpec();
	for (const operation of nodeOperations()) {
		const endpoint = endpoints.get(operation.key);
		assert.ok(endpoint, `${operation.name}: ${operation.key} is not in openapi.json`);
		for (const name of operation.query) {
			assert.ok(
				endpoint.query.has(name),
				`${operation.name}: query "${name}" is not a parameter of ${endpoint.id}`,
			);
		}
		for (const name of operation.body) {
			assert.ok(
				endpoint.body.has(name),
				`${operation.name}: body "${name}" is not a field of ${endpoint.id}`,
			);
		}
		for (const name of endpoint.requiredQuery) {
			assert.ok(
				operation.required.query.includes(name),
				`${operation.name}: required query "${name}" has no required field`,
			);
		}
		for (const name of endpoint.requiredBody) {
			assert.ok(
				operation.required.body.includes(name) || operation.body.includes(name),
				`${operation.name}: required body "${name}" is never sent`,
			);
		}
	}
});

test('every endpoint but agent onboarding is offered', { skip }, () => {
	const offered = new Set(nodeOperations().map((operation) => operation.key));
	const missing = [...loadSpec()]
		.filter(([key, endpoint]) => !offered.has(key) && !endpoint.id.includes('onboarding'))
		.map(([key]) => key);
	assert.deepEqual(missing, []);
});

test('Contact → Find looks one contact up by email or phone', () => {
	const find = nodeOperations().find((operation) => operation.name === 'contact.find');
	assert.ok(find, 'there is a Find operation');
	assert.equal(find.key, 'GET /contacts');
	assert.deepEqual(find.query.sort(), ['email', 'phone']);
});

test('the credential sends the key as a bearer token and tests it on /agents', () => {
	const { WiredeskApi } = require('../dist/credentials/WiredeskApi.credentials.js');
	const credential = new WiredeskApi();
	assert.equal(
		credential.authenticate.properties.headers.Authorization,
		'=Bearer {{$credentials.apiKey}}',
	);
	assert.equal(credential.test.request.baseURL, 'https://wiredesk.ai/api/v1');
	assert.equal(credential.test.request.url, '/agents');
});
