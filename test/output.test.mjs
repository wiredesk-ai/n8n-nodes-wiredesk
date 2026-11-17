// What the Wiredesk node does with an answer before n8n hands it on: a
// refusal becomes an error that says what happened and how to fix it, a
// delete outputs `{ "deleted": true }`, and Simplify keeps at most ten
// fields. Also checks the node's copy against n8n's UX guidelines
// (https://docs.n8n.io/integrations/creating-nodes/build/reference/ux-guidelines/).

import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { Wiredesk } = require('../dist/nodes/Wiredesk/Wiredesk.node.js');
const { WiredeskTrigger } = require('../dist/nodes/WiredeskTrigger/WiredeskTrigger.node.js');
const {
	checkResponse,
	deletedOutput,
	simplifyConversation,
	simplifyWith,
	simplifyInboxItem,
	simplifyKnowledgeSource,
} = require('../dist/nodes/Wiredesk/shared/output.js');
const { describeRefusal } = require('../dist/nodes/Wiredesk/shared/transport.js');

const { description } = new Wiredesk();
const { properties } = description;

/** An IExecuteSingleFunctions stand-in for item `itemIndex` of a node at `typeVersion`. */
function itemContext({ itemIndex = 0, typeVersion = 1.1, parameters = {} } = {}) {
	return {
		getItemIndex: () => itemIndex,
		getNode: () => ({ name: 'Wiredesk', type: 'n8n-nodes-wiredesk.wiredesk', typeVersion }),
		getNodeParameter: (name, fallback) => (name in parameters ? parameters[name] : fallback),
	};
}

/** Every operation the node offers: its resource, its option, and the selector's display options. */
function operations() {
	return properties
		.filter((p) => p.name === 'operation')
		.flatMap((selector) =>
			selector.options.map((option) => ({
				resource: selector.displayOptions.show.resource[0],
				option,
			})),
		);
}

/** Runs an operation's postReceive steps on an answer, as n8n's routing node does. */
async function runOutput(option, response, context = itemContext()) {
	let items = [{ json: response.body }];
	for (const step of option.routing.output.postReceive) {
		if (typeof step === 'function') {
			items = await step.call(context, items, response);
		} else if (step.type === 'rootProperty') {
			items = items.flatMap((item) => {
				const value = item.json[step.properties.property];
				return (Array.isArray(value) ? value : [value]).map((json) => ({ json }));
			});
		} else {
			throw new Error(`unexpected step ${step.type}`);
		}
	}
	return items;
}

const CONVERSATION = {
	id: 'conv_1',
	object: 'conversation',
	agent_id: 'agent_1',
	channel: 'chat',
	contact: { id: 'ct_1', kind: 'email', value: 'nathan@example.com', name: 'Nathan Smith' },
	status: 'ended',
	started_at: '2026-11-16T09:00:00.000Z',
	ended_at: '2026-11-16T09:05:00.000Z',
	outcome: 'resolved',
	summary: 'Asked about the returns policy.',
	topic: 'Returns',
	sentiment: 'positive',
	handover_state: null,
};

const INBOX_ITEM = {
	id: 'conv_1',
	object: 'inbox_item',
	kind: 'handover',
	conversation_id: 'conv_1',
	agent_name: 'Front Desk',
	channel: 'chat',
	contact: { kind: 'email', value: 'nathan@example.com', name: 'Nathan Smith' },
	text: 'Can I talk to a person?',
	at: '2026-11-16T09:00:00.000Z',
	handover_state: 'requested',
	handover_requests: 1,
	handled_by: null,
	url: 'https://console.wiredesk.ai/conversations/conv_1',
};

const KNOWLEDGE_SOURCE = {
	id: 'ks_1',
	object: 'knowledge_source',
	agent_id: 'agent_1',
	type: 'url',
	label: 'https://example.com',
	status: 'ready',
	error: null,
	chunk_count: 42,
	page_count: 7,
	created_at: '2026-11-16T09:00:00.000Z',
	updated_at: '2026-11-16T09:10:00.000Z',
};

describe('refusals', () => {
	test('the node asks n8n not to throw on a status, and every operation checks the answer first', () => {
		assert.equal(description.requestDefaults.ignoreHttpStatusErrors, true);
		for (const { resource, option } of operations()) {
			assert.equal(
				option.routing.output?.postReceive?.[0],
				checkResponse,
				`${resource}.${option.value} does not check the answer first`,
			);
		}
	});

	test('a 2xx answer passes through untouched', async () => {
		const items = [{ json: { data: { id: 'a' } } }];
		assert.equal(
			await checkResponse.call(itemContext(), items, { statusCode: 200, body: {} }),
			items,
		);
	});

	test('a refusal says what happened, how to fix it, which field, and which item', async () => {
		const response = {
			statusCode: 404,
			body: { error: { code: 'not_found', message: 'no agent with that id' } },
		};
		await assert.rejects(
			checkResponse.call(itemContext({ itemIndex: 2 }), [], response),
			(error) => {
				assert.equal(error.constructor.name, 'NodeApiError');
				assert.equal(error.message, 'No agent with that id [item 2]');
				assert.match(error.description, /^Check 'Agent':/);
				assert.match(error.description, /\(Wiredesk code: not_found\)$/);
				assert.equal(error.httpCode, '404');
				assert.equal(error.context.itemIndex, 2);
				return true;
			},
		);
	});

	test('a not-found names the field the ID came from', () => {
		for (const [said, field] of [
			['no knowledge source with that id', 'Knowledge Source ID'],
			['no webhook endpoint with that id', 'Webhook Endpoint ID'],
			['no conversation with that id', 'Conversation ID'],
			['no API conversation for this agent with that id', 'Conversation ID'],
			['no contact with that id', 'Contact ID'],
		]) {
			const { description: how } = describeRefusal(404, {
				error: { code: 'not_found', message: said },
			});
			assert.ok(how.startsWith(`Check '${field}'`), `${said}: ${how}`);
		}
	});

	test('a proxy page or an outage says to run it again', () => {
		const { message, description: how } = describeRefusal(502, '<html>Bad Gateway</html>');
		assert.equal(message, 'Wiredesk answered with HTTP status 502');
		assert.match(how, /Run the node again in a moment/);
	});

	test('no refusal uses the words n8n asks nodes to avoid', () => {
		const codes = [
			'unauthorized',
			'read_only_key',
			'insufficient_scope',
			'invalid_request',
			'spend_cap_reached',
			'channel_disabled',
			'knowledge_full',
			'agent_limit',
			'webhook_limit',
			'already_exists',
			'conflict',
			'rate_limited',
			'not_found',
			'internal_error',
			'upstream_error',
			'not_configured',
			'something_new',
		];
		for (const code of codes) {
			for (const status of [400, 500]) {
				const { description: how } = describeRefusal(status, { error: { code, message: 'x' } });
				assert.doesNotMatch(how, /\b(error|problem|failure|mistake)s?\b/i, `${code}: ${how}`);
			}
		}
	});
});

describe('delete output', () => {
	const deletes = operations().filter(({ option }) => option.value === 'delete');

	test('every delete is one item, { "deleted": true }', async () => {
		assert.deepEqual(deletes.map(({ resource }) => resource).sort(), [
			'agent',
			'contact',
			'knowledgeSource',
			'webhook',
		]);
		for (const { resource, option } of deletes) {
			const items = await runOutput(option, {
				statusCode: 200,
				body: { data: { id: 'x_1', object: resource, deleted: true } },
			});
			assert.deepEqual(items, [{ json: { deleted: true } }], resource);
		}
	});

	test('Simplify leaves a node added at version 1 as it was, though the hidden parameter falls back', async () => {
		const items = [{ json: CONVERSATION }];
		const step = simplifyWith(simplifyConversation);
		// At version 1 'simplify' is hidden, so n8n returns the fallback.
		assert.equal(await step.call(itemContext({ typeVersion: 1 }), items), items);
		const simplified = await step.call(itemContext({ parameters: { simplify: true } }), items);
		assert.deepEqual(simplified[0].json, simplifyConversation(CONVERSATION));
		assert.equal(await step.call(itemContext({ parameters: { simplify: false } }), items), items);
	});

	test('a node added at version 1 keeps the API’s answer', async () => {
		const items = [{ json: { id: 'x_1', object: 'contact', deleted: true } }];
		assert.equal(await deletedOutput.call(itemContext({ typeVersion: 1 }), items), items);
	});

	test('a refused delete is not reported as deleted', async () => {
		const [{ option }] = deletes;
		await assert.rejects(
			runOutput(option, {
				statusCode: 403,
				body: { error: { code: 'read_only_key', message: 'this API key is read-only' } },
			}),
			/This API key is read-only \[item 0\]/,
		);
	});
});

describe('Simplify', () => {
	const simplifyFields = properties.filter((p) => p.name === 'simplify');

	test('is offered where items have more than ten fields, as n8n names it, from version 1.1', () => {
		const shown = simplifyFields.flatMap((p) =>
			p.displayOptions.show.operation.map((op) => `${p.displayOptions.show.resource[0]}.${op}`),
		);
		assert.deepEqual(shown.sort(), [
			'conversation.get',
			'conversation.getAll',
			'conversation.getInbox',
			'conversation.search',
			'knowledgeSource.getAll',
		]);
		for (const field of simplifyFields) {
			assert.equal(field.displayName, 'Simplify');
			assert.equal(field.type, 'boolean');
			assert.equal(field.default, true);
			assert.equal(
				field.description,
				'Whether to return a simplified version of the response instead of the raw data',
			);
			assert.deepEqual(field.displayOptions.show['@version'], [{ _cnd: { gte: 1.1 } }]);
		}
		assert.deepEqual(description.version, [1, 1.1]);
	});

	test('a conversation keeps ten fields, id first, with the contact flattened', () => {
		const simple = simplifyConversation(CONVERSATION);
		assert.ok(Object.keys(CONVERSATION).length + 3 > 10);
		assert.equal(Object.keys(simple).length, 10);
		assert.equal(Object.keys(simple)[0], 'id');
		assert.equal(simple.contact_name, 'Nathan Smith');
		assert.equal(simple.contact_value, 'nathan@example.com');
		assert.equal(simple.summary, CONVERSATION.summary);
		assert.ok(Object.values(simple).every((value) => typeof value !== 'object' || value === null));
	});

	test('a conversation without a contact still simplifies', () => {
		const simple = simplifyConversation({ ...CONVERSATION, contact: null });
		assert.equal(simple.contact_name, null);
		assert.equal(simple.contact_value, null);
	});

	test('an inbox item and a knowledge source keep at most ten flat fields, id first', () => {
		for (const [pick, item] of [
			[simplifyInboxItem, INBOX_ITEM],
			[simplifyKnowledgeSource, KNOWLEDGE_SOURCE],
		]) {
			assert.ok(Object.keys(item).length > 10);
			const simple = pick(item);
			assert.ok(Object.keys(simple).length <= 10);
			assert.equal(simple.id, item.id);
			assert.equal(Object.keys(simple)[0], 'id');
			assert.ok(
				Object.values(simple).every((value) => typeof value !== 'object' || value === null),
			);
		}
		assert.equal(simplifyInboxItem(INBOX_ITEM).contact_value, 'nathan@example.com');
	});

	test('applies each page’s items when on, and leaves them when off', async () => {
		const [conversationSimplify] = simplifyFields;
		const [step] = conversationSimplify.routing.output.postReceive;
		const items = [{ json: CONVERSATION }];
		const on = await step.call(itemContext({ parameters: { simplify: true } }), items);
		assert.deepEqual(on, [{ json: simplifyConversation(CONVERSATION) }]);
		const off = await step.call(itemContext({ parameters: { simplify: false } }), items);
		assert.equal(off, items);
	});
});

describe('copy follows n8n’s UX guidelines', () => {
	const RESOURCE_NAMES = {
		agent: 'Agent',
		contact: 'Contact',
		conversation: 'Conversation',
		knowledgeSource: 'Knowledge Source',
		lead: 'Lead',
		webhook: 'Webhook Endpoint',
		workspace: 'Workspace',
	};

	test('the resources are the names Wiredesk’s dashboard uses', () => {
		const resource = properties.find((p) => p.name === 'resource');
		assert.deepEqual(
			Object.fromEntries(resource.options.map((o) => [o.value, o.name])),
			RESOURCE_NAMES,
		);
	});

	test('operation names do not repeat the resource; actions have no articles and name it', () => {
		for (const { resource, option } of operations()) {
			const where = `${resource}.${option.value}`;
			assert.ok(!option.name.includes(RESOURCE_NAMES[resource]), `${where} name: ${option.name}`);
			assert.match(option.name, /^[A-Z][a-z]*( [A-Z][a-z]*)*$/, `${where} name is Title Case`);
			assert.doesNotMatch(option.action, /\b(a|an|the)\b/i, `${where} action: ${option.action}`);
			assert.doesNotMatch(
				option.action.slice(1).replace(/\bAPI\b/g, ''),
				/[A-Z]/,
				`${where} action is sentence case: ${option.action}`,
			);
			const noun = RESOURCE_NAMES[resource].toLowerCase().split(' ')[0];
			assert.ok(
				option.action.includes(noun),
				`${where} action names the resource: ${option.action}`,
			);
			assert.match(option.description, /^[A-Z]/, `${where} description`);
		}
	});

	test('booleans start with "Whether" and placeholders with "e.g."', () => {
		const nodes = [description, new WiredeskTrigger().description];
		const fields = nodes.flatMap((node) =>
			node.properties.flatMap((p) => [p, ...(p.type === 'collection' ? p.options : [])]),
		);
		for (const field of fields) {
			if (field.type === 'boolean') assert.match(field.description, /^Whether /, field.name);
			if (field.placeholder && !['collection'].includes(field.type)) {
				assert.match(field.placeholder, /^e\.g\. /, `${field.name}: ${field.placeholder}`);
			}
			for (const mode of field.modes ?? []) {
				if (mode.type !== 'list') assert.match(mode.placeholder, /^e\.g\. /, field.name);
			}
		}
	});
});
