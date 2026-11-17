import { createHmac, timingSafeEqual } from 'crypto';
import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type IHttpRequestMethods,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';
import { BASE_URL } from '../Wiredesk/shared/transport';

/**
 * Starts a workflow on Wiredesk's webhooks
 * (https://wiredesk.ai/docs/developers/webhooks). Activating the workflow
 * adds a webhook endpoint for n8n's URL with POST /webhooks and keeps its id
 * and signing secret in the node's static data; deactivating it removes the
 * endpoint. Every delivery's Standard Webhooks signature is checked against
 * that secret, and one that does not match is refused with a 401.
 */

/** The events an endpoint can be sent, as @wiredesk/core/webhook-events names them. */
export const EVENTS = [
	{
		name: 'Conversation Ended',
		value: 'conversation.ended',
		description:
			'A conversation closed and was summarised, with its summary, outcome, topic and sentiment',
	},
	{
		name: 'Handover Requested',
		value: 'handover.requested',
		description: 'The agent asked for a person to take over',
	},
	{
		name: 'Lead Captured',
		value: 'lead.captured',
		description: 'The agent captured a name and a way to reach someone',
	},
	{
		name: 'Message Created',
		value: 'message.created',
		description:
			'A customer, the agent or someone on the team wrote in a chat or email conversation',
	},
];

/** A delivery older or newer than this, by its `webhook-timestamp`, is refused as a replay. */
export const TOLERANCE_SECONDS = 5 * 60;

interface Endpoint {
	id: string;
	url: string;
	events: string[];
	enabled?: boolean;
	secret?: string;
}

interface Stored {
	id: string;
	secret: string;
}

/**
 * The node's static data: one endpoint per webhook URL. n8n runs the
 * lifecycle for the test URL ("Listen for test event") while the production
 * URL's endpoint stays live, so each call touches only its own URL's entry.
 * `webhookId` and `webhookSecret` are the single endpoint an earlier build
 * kept, moved under its URL the first time the list is read.
 */
interface StaticData {
	endpoints?: Record<string, Stored>;
	webhookId?: string;
	webhookSecret?: string;
}

function storedEndpoints(data: StaticData): Record<string, Stored> {
	if (!data.endpoints) data.endpoints = {};
	return data.endpoints;
}

/** The workspace's endpoints, or the API's error thrown. */
async function listEndpoints(this: IHookFunctions): Promise<Endpoint[]> {
	const response = await request.call(this, 'GET', '/webhooks');
	if (response.statusCode >= 400) throw apiError.call(this, response);
	return (response.body.data ?? []) as unknown as Endpoint[];
}

/** Files an earlier build's single endpoint under its URL, or drops it if it is gone. */
function migrateLegacy(data: StaticData, endpoints: Endpoint[]) {
	if (!data.webhookId) return;
	const legacy = endpoints.find((endpoint) => endpoint.id === data.webhookId);
	const stored = storedEndpoints(data);
	if (legacy && data.webhookSecret && !stored[legacy.url]) {
		stored[legacy.url] = { id: legacy.id, secret: data.webhookSecret };
	}
	delete data.webhookId;
	delete data.webhookSecret;
}

/** Removes one endpoint; one already gone (a 404) counts as removed. */
async function removeEndpoint(this: IHookFunctions, id: string) {
	const response = await request.call(this, 'DELETE', `/webhooks/${encodeURIComponent(id)}`);
	if (response.statusCode >= 400 && response.statusCode !== 404) {
		throw apiError.call(this, response);
	}
}

/**
 * One request to the API with the node's credential. Errors come back as
 * the status and body rather than thrown, so a 404 on removal can count as
 * removed and everything else can be shown in the API's own words.
 */
async function request(
	this: IHookFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
): Promise<{ statusCode: number; body: IDataObject }> {
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'wiredeskApi', {
		method,
		url: `${BASE_URL}${path}`,
		body,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as { statusCode: number; body: unknown };
	// A proxy's error page is text, not the API's `{ error }`.
	const parsed = response.body && typeof response.body === 'object' ? response.body : {};
	return { statusCode: response.statusCode, body: parsed as IDataObject };
}

function apiError(this: IHookFunctions, response: { statusCode: number; body: IDataObject }) {
	const error = (response.body.error ?? {}) as IDataObject;
	const message =
		typeof error.message === 'string' ? error.message : `Wiredesk answered ${response.statusCode}`;
	let description: string | undefined;
	if (error.code === 'read_only_key') {
		description =
			'The trigger adds a webhook endpoint in Wiredesk, which takes a Full access API key.';
	} else if (error.code === 'webhook_limit') {
		description =
			'Each active Wiredesk Trigger uses one of the workspace’s webhook endpoints. Deactivate a workflow you no longer need, or remove an endpoint under Developers → Webhooks.';
	} else if (error.code === 'invalid_request') {
		description =
			'Wiredesk sends webhooks only to https URLs on a public host, so n8n’s webhook URL has to be reachable from the internet.';
	}
	return new NodeApiError(this.getNode(), response.body as JsonObject, {
		message,
		description,
		httpCode: String(response.statusCode),
	});
}

/** The header's value, or undefined: Node lowercases names, and repeats arrive as an array. */
function headerOf(headers: IDataObject, name: string): string | undefined {
	const value = headers[name];
	if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
	return typeof value === 'string' ? value : undefined;
}

/**
 * True when one of the space-separated `v1,<base64>` signatures is
 * HMAC-SHA256 of `id.timestamp.body` under `secret` (`whsec_<base64>`), and
 * the timestamp is within TOLERANCE_SECONDS of `now`.
 */
export function verifySignature(
	secret: string,
	headers: IDataObject,
	body: string,
	now = Date.now(),
): boolean {
	const id = headerOf(headers, 'webhook-id');
	const timestamp = headerOf(headers, 'webhook-timestamp');
	const signatures = headerOf(headers, 'webhook-signature');
	if (!secret || !id || !timestamp || !signatures) return false;
	const seconds = Number(timestamp);
	if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS) return false;
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
	return signatures.split(' ').some((part) => {
		const [version, signature] = part.split(',');
		if (version !== 'v1' || !signature) return false;
		const given = Buffer.from(signature, 'base64');
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}

function sameEvents(a: string[], b: string[]) {
	return a.length === b.length && a.every((event) => b.includes(event));
}

export class WiredeskTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Wiredesk Trigger',
		name: 'wiredeskTrigger',
		icon: { light: 'file:../../icons/wiredesk.svg', dark: 'file:../../icons/wiredesk.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow the moment a Wiredesk conversation ends, a lead is captured, a handover is requested or a message is written',
		defaults: {
			name: 'Wiredesk Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'wiredeskApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Activating the workflow adds a webhook endpoint in Wiredesk (Developers → Webhooks), and deactivating it removes it. It needs a Full access API key, and uses one of the workspace’s 10 endpoints.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: EVENTS,
				default: [],
				description: 'The Wiredesk events that start the workflow',
			},
		],
	};

	webhookMethods = {
		default: {
			/**
			 * Whether this URL's endpoint is still there, switched on, with these
			 * events. If it was removed or switched off in Wiredesk (as one is
			 * after three days of failed deliveries), or the events changed, it is
			 * removed and forgotten so `create` makes a new one. Endpoints for the
			 * workflow's other URL (test or production) are left alone.
			 */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StaticData;
				const url = this.getNodeWebhookUrl('default') as string;
				if (!data.webhookId && !data.endpoints?.[url]) return false;
				const endpoints = await listEndpoints.call(this);
				migrateLegacy(data, endpoints);
				const stored = storedEndpoints(data);
				const entry = stored[url];
				if (!entry) return false;
				const mine = endpoints.find((endpoint) => endpoint.id === entry.id);
				const events = this.getNodeParameter('events') as string[];
				if (mine && mine.url === url && mine.enabled !== false && sameEvents(mine.events, events)) {
					return true;
				}
				if (mine) await removeEndpoint.call(this, mine.id);
				delete stored[url];
				return false;
			},

			/** Adds this URL's endpoint and keeps its id and signing secret, which Wiredesk shows only now. */
			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') as string;
				const response = await request.call(this, 'POST', '/webhooks', {
					url,
					events: this.getNodeParameter('events') as string[],
					description: `n8n: ${this.getNode().name}`.slice(0, 120),
				});
				if (response.statusCode >= 400) throw apiError.call(this, response);
				const endpoint = response.body.data as unknown as Endpoint;
				const data = this.getWorkflowStaticData('node') as StaticData;
				storedEndpoints(data)[url] = { id: endpoint.id, secret: endpoint.secret ?? '' };
				return true;
			},

			/**
			 * Removes this URL's endpoint, and only it: stopping a test listen
			 * leaves the production endpoint running. One already gone (a 404)
			 * counts as removed.
			 */
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StaticData;
				const url = this.getNodeWebhookUrl('default') as string;
				if (data.webhookId) migrateLegacy(data, await listEndpoints.call(this));
				const stored = storedEndpoints(data);
				const entry = stored[url];
				if (entry) await removeEndpoint.call(this, entry.id);
				delete stored[url];
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const data = this.getWorkflowStaticData('node') as StaticData;
		const req = this.getRequestObject();
		const headers = this.getHeaderData() as IDataObject;
		// The bytes as sent: re-serialising the parsed body could change them.
		const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(this.getBodyData());
		// The test and production URLs each have an endpoint and a secret;
		// a delivery to either is signed with one of them.
		const secrets = [
			...Object.values(data.endpoints ?? {}).map((entry) => entry.secret),
			data.webhookSecret ?? '',
		].filter(Boolean);
		if (!secrets.some((secret) => verifySignature(secret, headers, raw))) {
			const res = this.getResponseObject();
			res.status(401).send('Signature does not match this workflow’s Wiredesk endpoint').end();
			return { noWebhookResponse: true };
		}
		const body = this.getBodyData();
		const events = this.getNodeParameter('events') as string[];
		// The dashboard's Send test event reaches every endpoint: answer it, start nothing.
		if (typeof body.type !== 'string' || !events.includes(body.type)) {
			return { webhookResponse: 'OK' };
		}
		return {
			workflowData: [
				this.helpers.returnJsonArray({ ...body, delivery_id: headerOf(headers, 'webhook-id') }),
			],
		};
	}
}
