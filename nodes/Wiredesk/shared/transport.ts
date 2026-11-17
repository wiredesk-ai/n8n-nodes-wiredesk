import type {
	IDataObject,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

export const BASE_URL = 'https://wiredesk.ai/api/v1';

/** One request to the Wiredesk API with the node's credential. */
export async function wiredeskApiRequest(
	this: ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	path: string,
	qs: IDataObject = {},
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${path}`,
		qs,
		json: true,
	};
	return (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'wiredeskApi',
		options,
	)) as IDataObject;
}

export interface AgentSummary {
	id: string;
	name: string;
}

export interface AgentPage {
	data: AgentSummary[];
	next_cursor: string | null;
	has_more: boolean;
}

/**
 * How to get past each of the API's refusals
 * (https://wiredesk.ai/docs/api-reference/errors), worded for someone
 * looking at the node in n8n.
 */
const HOW_TO_FIX: Record<string, string> = {
	unauthorized:
		"Make a new key under Developers → API keys in Wiredesk and paste it into the Wiredesk API credential’s 'API Key'. A key stops working when it is revoked, or when the person who made it is no longer an owner or admin.",
	read_only_key:
		'This operation changes something, so it needs a Full access key. Make one under Developers → API keys in Wiredesk and use it in the Wiredesk API credential.',
	insufficient_scope:
		'This credential isn’t allowed to do that. Use a Full access API key from Developers → API keys in Wiredesk.',
	invalid_request: 'Change the field the message names, then run the node again.',
	spend_cap_reached:
		'The workspace has reached its spend cap. An owner can raise it under Billing in Wiredesk.',
	channel_disabled:
		"'Send Message' uses the agent’s chat channel. Switch chat on in the agent’s Channels in Wiredesk.",
	knowledge_full:
		'The agent’s knowledge is at the plan’s limit. Delete a knowledge source it no longer needs, or upgrade the plan under Billing in Wiredesk.',
	agent_limit:
		'Every agent the plan allows is in use. Delete an agent you no longer need, or upgrade the plan under Billing in Wiredesk.',
	webhook_limit:
		'The workspace has 10 webhook endpoints already. Delete one you no longer need under Developers → Webhooks, or deactivate a workflow with a Wiredesk Trigger.',
	already_exists: 'It is there already: look it up with Get Many or Find instead of creating it.',
	conflict: 'It changed in the meantime. Get it again, then retry.',
	rate_limited:
		"Too many requests for this API key. Space them out with the node’s batching settings under 'Options', or turn on 'Retry On Fail' in the node’s settings.",
};

/** Run again later: what to do when Wiredesk itself couldn't answer. */
const TRY_AGAIN =
	"Wiredesk couldn’t finish this just now. Run the node again in a moment, or turn on 'Retry On Fail' in the node’s settings.";

/** The field to check when an ID matched nothing, by what the API says it looked for. */
const NOT_FOUND_FIELDS: Array<[string, string]> = [
	['knowledge source', 'Knowledge Source ID'],
	['webhook endpoint', 'Webhook Endpoint ID'],
	['conversation', 'Conversation ID'],
	['contact', 'Contact ID'],
	['agent', 'Agent'],
];

/**
 * What happened and how to fix it, for a refusal from the API: its
 * `{ error: { code, message } }` body, or a proxy's page (anything else).
 * The message is the API's own, starting with a capital; the description
 * says what to change, names the field when the API says which, and ends
 * with the API's code so it can be looked up.
 */
export function describeRefusal(
	statusCode: number,
	body: unknown,
): { message: string; description: string } {
	const refusal =
		body && typeof body === 'object' && 'error' in body
			? ((body as IDataObject).error as IDataObject)
			: undefined;
	const code = typeof refusal?.code === 'string' ? refusal.code : undefined;
	const said = typeof refusal?.message === 'string' ? refusal.message.trim() : '';
	const message = said
		? said.charAt(0).toUpperCase() + said.slice(1)
		: `Wiredesk answered with HTTP status ${statusCode}`;

	let fix = code ? HOW_TO_FIX[code] : undefined;
	if (code === 'not_found') {
		const field = NOT_FOUND_FIELDS.find(([noun]) => said.toLowerCase().includes(noun))?.[1];
		fix = field
			? `Check '${field}': it has to be the ID of one in this workspace, from a Get Many, a Search or an earlier node’s output.`
			: 'Check the IDs in the node’s fields: each has to be one in this workspace.';
	}
	if (!fix) fix = statusCode >= 500 ? TRY_AGAIN : 'Check the node’s fields, then run it again.';
	return { message, description: code ? `${fix} (Wiredesk code: ${code})` : fix };
}
