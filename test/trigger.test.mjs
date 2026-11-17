// The Wiredesk Trigger node, run against stand-ins for n8n's hook and webhook
// contexts: activating adds an endpoint and keeps its id and secret,
// deactivating removes it (a 404 counts as removed), and a delivery starts
// the workflow only when its Standard Webhooks signature matches.

import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
	WiredeskTrigger,
	EVENTS,
	verifySignature,
} = require('../dist/nodes/WiredeskTrigger/WiredeskTrigger.node.js');

const BASE = 'https://wiredesk.ai/api/v1';
const URL = 'https://n8n.example.com/webhook/0f9e/webhook';
const SECRET = `whsec_${Buffer.from('n8n-test-signing-secret-32-bytes').toString('base64')}`;
/** "Listen for test event" runs the same lifecycle on the test URL. */
const TEST_URL = 'https://n8n.example.com/webhook-test/0f9e/webhook';
const TEST_SECRET = `whsec_${Buffer.from('n8n-test-url-listen-secret-32byt').toString('base64')}`;

const node = new WiredeskTrigger();
const methods = node.webhookMethods.default;

/** An IHookFunctions stand-in: answers each API request with the next of `answers`. */
function hookContext({
	answers = [],
	staticData = {},
	events = ['lead.captured'],
	url = URL,
} = {}) {
	const requests = [];
	return {
		requests,
		staticData,
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => url,
		getNodeParameter: (name) => (name === 'events' ? events : undefined),
		getNode: () => ({ name: 'Wiredesk Trigger', type: 'n8n-nodes-wiredesk.wiredeskTrigger' }),
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				assert.equal(credential, 'wiredeskApi');
				assert.equal(options.ignoreHttpStatusErrors, true);
				requests.push({ method: options.method, url: options.url, body: options.body });
				const [statusCode, body] = answers.shift() ?? [200, {}];
				return { statusCode, body };
			},
		},
	};
}

function sign(secret, id, timestamp, body) {
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

/** A delivery as Wiredesk sends it, signed with `secret`, `timestamp` seconds. */
function deliveryHeaders(body, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
	const id = 'msg_2f8c0e4a9b7d4c1e8f3a6b5d0c9e7f12';
	return {
		'content-type': 'application/json',
		'webhook-id': id,
		'webhook-timestamp': String(timestamp),
		'webhook-signature': sign(secret, id, String(timestamp), body),
	};
}

/** An IWebhookFunctions stand-in, recording a refusal if the node sends one. */
function webhookContext(
	raw,
	headers,
	{
		events = ['lead.captured'],
		secret = SECRET,
		staticData = { endpoints: secret ? { [URL]: { id: 'wh_1', secret } } : {} },
	} = {},
) {
	const sent = {};
	const res = {
		status(code) {
			sent.status = code;
			return res;
		},
		send(text) {
			sent.text = text;
			return res;
		},
		end() {
			sent.ended = true;
			return res;
		},
	};
	return {
		sent,
		getWorkflowStaticData: () => staticData,
		getRequestObject: () => ({ rawBody: Buffer.from(raw) }),
		getResponseObject: () => res,
		getHeaderData: () => headers,
		getBodyData: () => JSON.parse(raw),
		getNodeParameter: (name) => (name === 'events' ? events : undefined),
		helpers: { returnJsonArray: (item) => [{ json: item }] },
	};
}

const leadEvent = JSON.stringify({
	type: 'lead.captured',
	timestamp: '2026-11-16T14:03:12.000Z',
	data: { lead: { id: 'l1', object: 'lead', name: 'Jane Doe', email: 'jane@example.com' } },
});

describe('the node', () => {
	test('is a webhook trigger with every Wiredesk event to choose from', () => {
		const { description } = node;
		assert.equal(description.name, 'wiredeskTrigger');
		assert.deepEqual(description.group, ['trigger']);
		assert.deepEqual(description.inputs, []);
		assert.deepEqual(description.webhooks, [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		]);
		assert.deepEqual(EVENTS.map((event) => event.value).sort(), [
			'conversation.ended',
			'handover.requested',
			'lead.captured',
			'message.created',
		]);
	});
});

/** The production URL's entry, as `create` stores it. */
const stored = (id = 'wh_1', secret = SECRET) => ({ endpoints: { [URL]: { id, secret } } });
const listed = (...endpoints) => [200, { data: endpoints }];
const endpoint = (overrides = {}) => ({
	id: 'wh_1',
	url: URL,
	events: ['lead.captured'],
	enabled: true,
	...overrides,
});

describe('activating and deactivating', () => {
	test('create adds an endpoint for n8n’s URL and keeps its id and secret under that URL', async () => {
		const context = hookContext({
			answers: [
				[201, { data: { id: 'wh_1', url: URL, events: ['lead.captured'], secret: SECRET } }],
			],
		});
		assert.equal(await methods.create.call(context), true);
		assert.deepEqual(context.requests, [
			{
				method: 'POST',
				url: `${BASE}/webhooks`,
				body: { url: URL, events: ['lead.captured'], description: 'n8n: Wiredesk Trigger' },
			},
		]);
		assert.deepEqual(context.staticData, stored());
	});

	test('create shows the API’s reason when it refuses, with what to do', async () => {
		const context = hookContext({
			answers: [
				[
					403,
					{
						error: {
							code: 'webhook_limit',
							message: 'a workspace can have up to 10 webhook endpoints',
						},
					},
				],
			],
		});
		await assert.rejects(methods.create.call(context), (error) => {
			assert.equal(error.message, 'A workspace can have up to 10 webhook endpoints');
			assert.match(error.description, /Deactivate a workflow you no longer need/);
			assert.match(error.description, /\(Wiredesk code: webhook_limit\)$/);
			return true;
		});
		assert.deepEqual(context.staticData, {});
	});

	test('create explains a read-only key and an unreachable URL', async () => {
		for (const [code, pattern] of [
			['read_only_key', /Full access/],
			['invalid_request', /public host/],
		]) {
			const context = hookContext({ answers: [[400, { error: { code, message: 'no' } }]] });
			await assert.rejects(methods.create.call(context), (error) =>
				pattern.test(error.description),
			);
		}
		const context = hookContext({ answers: [[502, 'Bad Gateway']] });
		await assert.rejects(methods.create.call(context), /Wiredesk answered with HTTP status 502/);
	});

	test('delete removes this URL’s endpoint and forgets it', async () => {
		const context = hookContext({
			staticData: stored(),
			answers: [[200, { data: { id: 'wh_1', deleted: true } }]],
		});
		assert.equal(await methods.delete.call(context), true);
		assert.deepEqual(context.requests, [
			{ method: 'DELETE', url: `${BASE}/webhooks/wh_1`, body: undefined },
		]);
		assert.deepEqual(context.staticData, { endpoints: {} });
	});

	test('delete takes an endpoint that is already gone as removed', async () => {
		const context = hookContext({
			staticData: stored(),
			answers: [
				[404, { error: { code: 'not_found', message: 'no webhook endpoint with that id' } }],
			],
		});
		assert.equal(await methods.delete.call(context), true);
		assert.deepEqual(context.staticData, { endpoints: {} });
	});

	test('delete passes on any other failure and keeps the endpoint to try again', async () => {
		const context = hookContext({
			staticData: stored(),
			answers: [[500, { error: { code: 'internal', message: 'something broke' } }]],
		});
		await assert.rejects(methods.delete.call(context), /Something broke/);
		assert.equal(context.staticData.endpoints[URL].id, 'wh_1');
	});

	test('delete with nothing stored for this URL asks for nothing', async () => {
		const context = hookContext();
		assert.equal(await methods.delete.call(context), true);
		assert.deepEqual(context.requests, []);
	});

	test('delete removes only the current URL’s entry', async () => {
		const staticData = {
			endpoints: {
				[URL]: { id: 'wh_prod', secret: SECRET },
				[TEST_URL]: { id: 'wh_test', secret: TEST_SECRET },
			},
		};
		const context = hookContext({ url: TEST_URL, staticData, answers: [[200, {}]] });
		await methods.delete.call(context);
		assert.deepEqual(context.requests, [
			{ method: 'DELETE', url: `${BASE}/webhooks/wh_test`, body: undefined },
		]);
		assert.deepEqual(staticData.endpoints, { [URL]: { id: 'wh_prod', secret: SECRET } });
	});

	test('listening for a test event while active leaves the production endpoint untouched', async () => {
		const staticData = stored('wh_prod');
		const production = endpoint({ id: 'wh_prod' });
		// n8n runs checkExists, create, then (when the listen stops) delete for the test URL.
		// checkExists has nothing stored for the test URL, so it asks nothing.
		const answers = [
			[
				201,
				{ data: { id: 'wh_test', url: TEST_URL, events: ['lead.captured'], secret: TEST_SECRET } },
			],
			[200, {}],
		];
		const context = hookContext({ url: TEST_URL, staticData, answers });
		assert.equal(await methods.checkExists.call(context), false);
		await methods.create.call(context);
		assert.deepEqual(staticData.endpoints, {
			[URL]: { id: 'wh_prod', secret: SECRET },
			[TEST_URL]: { id: 'wh_test', secret: TEST_SECRET },
		});
		await methods.delete.call(context);
		assert.deepEqual(staticData.endpoints, { [URL]: { id: 'wh_prod', secret: SECRET } });
		assert.ok(
			context.requests.every((request) => !request.url.endsWith('/wh_prod')),
			'the production endpoint is never deleted',
		);
		// The production URL still finds its endpoint afterwards.
		const live = hookContext({ staticData, answers: [listed(production)] });
		assert.equal(await methods.checkExists.call(live), true);
	});

	test('checkExists finds its own endpoint for this URL and these events', async () => {
		const context = hookContext({ staticData: stored(), answers: [listed(endpoint())] });
		assert.equal(await methods.checkExists.call(context), true);
		assert.deepEqual(context.requests, [
			{ method: 'GET', url: `${BASE}/webhooks`, body: undefined },
		]);
	});

	test('checkExists replaces an endpoint whose events changed', async () => {
		const context = hookContext({
			events: ['lead.captured', 'conversation.ended'],
			staticData: stored(),
			answers: [listed(endpoint()), [200, {}]],
		});
		assert.equal(await methods.checkExists.call(context), false);
		assert.equal(context.requests[1].method, 'DELETE');
		assert.deepEqual(context.staticData, { endpoints: {} });
	});

	test('checkExists treats an endpoint Wiredesk switched off as gone, so create makes a new one', async () => {
		const staticData = stored();
		const answers = [
			listed(endpoint({ enabled: false })),
			[404, { error: { code: 'not_found', message: 'gone' } }],
			[201, { data: { id: 'wh_2', url: URL, events: ['lead.captured'], secret: TEST_SECRET } }],
		];
		const context = hookContext({ staticData, answers });
		assert.equal(await methods.checkExists.call(context), false);
		assert.deepEqual(context.requests[1], {
			method: 'DELETE',
			url: `${BASE}/webhooks/wh_1`,
			body: undefined,
		});
		assert.deepEqual(staticData, { endpoints: {} });
		await methods.create.call(context);
		assert.deepEqual(staticData.endpoints[URL], { id: 'wh_2', secret: TEST_SECRET });
	});

	test('checkExists passes on a failure to remove a stale endpoint and keeps it to try again', async () => {
		for (const stale of [endpoint({ enabled: false }), endpoint({ events: ['message.created'] })]) {
			const context = hookContext({
				staticData: stored(),
				answers: [
					listed(stale),
					[500, { error: { code: 'internal', message: 'something broke' } }],
				],
			});
			await assert.rejects(methods.checkExists.call(context), /Something broke/);
			// Still stored, so the next activation or delete can finish the removal.
			assert.deepEqual(context.staticData, stored());
		}
	});

	test('checkExists forgets an endpoint removed in the dashboard', async () => {
		const context = hookContext({
			staticData: stored(),
			answers: [listed(endpoint({ id: 'other' }))],
		});
		assert.equal(await methods.checkExists.call(context), false);
		assert.equal(context.requests.length, 1);
		assert.deepEqual(context.staticData, { endpoints: {} });
	});

	test('checkExists without a stored endpoint for this URL asks for nothing', async () => {
		const context = hookContext({ url: TEST_URL, staticData: stored() });
		assert.equal(await methods.checkExists.call(context), false);
		assert.deepEqual(context.requests, []);
	});

	test('checkExists passes on a failed listing', async () => {
		const context = hookContext({
			staticData: stored(),
			answers: [[401, { error: { code: 'unauthorized', message: 'that API key is not valid' } }]],
		});
		await assert.rejects(methods.checkExists.call(context), /That API key is not valid/);
	});

	test('an earlier build’s single endpoint is filed under its URL', async () => {
		const staticData = { webhookId: 'wh_1', webhookSecret: SECRET };
		const context = hookContext({ staticData, answers: [listed(endpoint())] });
		assert.equal(await methods.checkExists.call(context), true);
		assert.deepEqual(staticData, stored());

		const gone = { webhookId: 'wh_1', webhookSecret: SECRET };
		const forget = hookContext({ staticData: gone, answers: [listed()] });
		assert.equal(await methods.checkExists.call(forget), false);
		assert.deepEqual(gone, { endpoints: {} });

		const toDelete = { webhookId: 'wh_1', webhookSecret: SECRET };
		const removing = hookContext({
			staticData: toDelete,
			answers: [listed(endpoint()), [200, {}]],
		});
		await methods.delete.call(removing);
		assert.equal(removing.requests[1].url, `${BASE}/webhooks/wh_1`);
		assert.deepEqual(toDelete, { endpoints: {} });
	});
});

describe('deliveries', () => {
	test('a signed delivery starts the workflow with the event and its delivery id', async () => {
		const context = webhookContext(leadEvent, deliveryHeaders(leadEvent));
		const result = await node.webhook.call(context);
		assert.deepEqual(result.workflowData, [
			[
				{
					json: {
						...JSON.parse(leadEvent),
						delivery_id: 'msg_2f8c0e4a9b7d4c1e8f3a6b5d0c9e7f12',
					},
				},
			],
		]);
	});

	test('a delivery signed with another secret is refused with a 401', async () => {
		const other = `whsec_${Buffer.from('someone-else-entirely-32-bytes!!').toString('base64')}`;
		const context = webhookContext(leadEvent, deliveryHeaders(leadEvent, other));
		const result = await node.webhook.call(context);
		assert.deepEqual(result, { noWebhookResponse: true });
		assert.equal(context.sent.status, 401);
		assert.equal(context.sent.ended, true);
	});

	test('a body changed after signing, or no signature, is refused', async () => {
		const headers = deliveryHeaders(leadEvent);
		const changed = leadEvent.replace('Jane', 'Mallory');
		assert.equal(
			(await node.webhook.call(webhookContext(changed, headers))).noWebhookResponse,
			true,
		);
		const unsigned = { ...headers, 'webhook-signature': undefined };
		assert.equal(
			(await node.webhook.call(webhookContext(leadEvent, unsigned))).noWebhookResponse,
			true,
		);
	});

	test('a delivery signed with either stored secret, test or production, is accepted', async () => {
		const staticData = {
			endpoints: {
				[URL]: { id: 'wh_prod', secret: SECRET },
				[TEST_URL]: { id: 'wh_test', secret: TEST_SECRET },
			},
		};
		for (const secret of [SECRET, TEST_SECRET]) {
			const context = webhookContext(leadEvent, deliveryHeaders(leadEvent, secret), { staticData });
			const result = await node.webhook.call(context);
			assert.equal(result.workflowData[0][0].json.type, 'lead.captured');
		}
		const legacy = { webhookId: 'wh_1', webhookSecret: SECRET };
		const context = webhookContext(leadEvent, deliveryHeaders(leadEvent), { staticData: legacy });
		assert.ok((await node.webhook.call(context)).workflowData);
	});

	test('a delivery is refused when the workflow has no secret stored', async () => {
		const context = webhookContext(leadEvent, deliveryHeaders(leadEvent), { secret: null });
		assert.equal((await node.webhook.call(context)).noWebhookResponse, true);
	});

	test('an old delivery is refused as a replay', async () => {
		const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
		const context = webhookContext(leadEvent, deliveryHeaders(leadEvent, SECRET, tenMinutesAgo));
		assert.equal((await node.webhook.call(context)).noWebhookResponse, true);
	});

	test('the dashboard’s test event is answered without starting the workflow', async () => {
		const test = JSON.stringify({
			type: 'webhook.test',
			timestamp: '2026-11-16T14:03:12.000Z',
			data: { endpoint_id: 'wh_1', message: 'A test event' },
		});
		const result = await node.webhook.call(webhookContext(test, deliveryHeaders(test)));
		assert.deepEqual(result, { webhookResponse: 'OK' });
	});

	test('the body is checked as received, falling back to the parsed body', async () => {
		const context = webhookContext(leadEvent, deliveryHeaders(leadEvent));
		context.getRequestObject = () => ({});
		const result = await node.webhook.call(context);
		assert.equal(result.workflowData[0][0].json.type, 'lead.captured');
	});

	test('verifySignature accepts either signature during a secret rotation', () => {
		const now = Date.now();
		const headers = deliveryHeaders(leadEvent, SECRET, Math.floor(now / 1000));
		const old = `whsec_${Buffer.from('the-secret-before-the-rotation!!').toString('base64')}`;
		const both = {
			...headers,
			'webhook-signature': `${sign(old, headers['webhook-id'], headers['webhook-timestamp'], leadEvent)} ${headers['webhook-signature']}`,
		};
		assert.equal(verifySignature(SECRET, both, leadEvent, now), true);
		assert.equal(
			verifySignature(SECRET, { ...both, 'webhook-signature': ['v2,abc'] }, leadEvent, now),
			false,
		);
		assert.equal(
			verifySignature(SECRET, { ...headers, 'webhook-timestamp': 'soon' }, leadEvent, now),
			false,
		);
		assert.equal(
			verifySignature(
				SECRET,
				{ ...headers, 'webhook-id': [headers['webhook-id']] },
				leadEvent,
				now,
			),
			true,
		);
	});
});
