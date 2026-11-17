import {
	NodeApiError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type JsonObject,
} from 'n8n-workflow';
import { describeRefusal } from './transport';

/**
 * What the node does with each answer before n8n hands it on. The node asks
 * n8n not to throw on an HTTP status (`ignoreHttpStatusErrors` in
 * `requestDefaults`), so every operation's first step is `checkResponse`:
 * a refusal becomes an error that says what happened and how to fix it.
 */

/** The first node version with Simplify and the one-item delete output. */
export const SIMPLIFY_VERSION = 1.1;

/** Passes a 2xx answer on; turns any other into what happened, how to fix it, and the item. */
export async function checkResponse(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (response.statusCode < 400) return items;
	const { message, description } = describeRefusal(response.statusCode, response.body);
	const itemIndex = this.getItemIndex();
	const body =
		response.body && typeof response.body === 'object' ? (response.body as JsonObject) : {};
	throw new NodeApiError(this.getNode(), body, {
		message: `${message} [item ${itemIndex}]`,
		description,
		httpCode: String(response.statusCode),
		itemIndex,
	});
}

/** A delete's output from node version 1.1 on: one item, `{ "deleted": true }`. */
export async function deletedOutput(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	if (this.getNode().typeVersion < SIMPLIFY_VERSION) return items;
	return [{ json: { deleted: true } }];
}

/** A step that, when 'Simplify' is on, keeps the fields `pick` chooses of each item. */
export function simplifyWith(pick: (item: IDataObject) => IDataObject) {
	return async function (
		this: IExecuteSingleFunctions,
		items: INodeExecutionData[],
	): Promise<INodeExecutionData[]> {
		// A node saved at version 1 has no 'Simplify' (it's hidden there), and n8n
		// would hand back the fallback: keep that node's output exactly as it was.
		if (this.getNode().typeVersion < SIMPLIFY_VERSION) return items;
		if (!this.getNodeParameter('simplify', false)) return items;
		return items.map((item) => ({ ...item, json: pick(item.json) }));
	};
}

const nested = (item: IDataObject, key: string) =>
	(item[key] && typeof item[key] === 'object' ? item[key] : {}) as IDataObject;

/** A conversation's ten most used fields, with who it was with flattened. */
export function simplifyConversation(item: IDataObject): IDataObject {
	const contact = nested(item, 'contact');
	return {
		id: item.id,
		channel: item.channel,
		status: item.status,
		contact_name: contact.name ?? null,
		contact_value: contact.value ?? null,
		started_at: item.started_at,
		summary: item.summary,
		outcome: item.outcome,
		topic: item.topic,
		sentiment: item.sentiment,
	};
}

/** An inbox item's ten most used fields, with who it is with flattened. */
export function simplifyInboxItem(item: IDataObject): IDataObject {
	const contact = nested(item, 'contact');
	return {
		id: item.id,
		kind: item.kind,
		conversation_id: item.conversation_id,
		agent_name: item.agent_name,
		channel: item.channel,
		contact_name: contact.name ?? null,
		contact_value: contact.value ?? null,
		text: item.text,
		at: item.at,
		url: item.url,
	};
}

/** A knowledge source's most used fields: what it is and whether the agent can use it yet. */
export function simplifyKnowledgeSource(item: IDataObject): IDataObject {
	return {
		id: item.id,
		label: item.label,
		type: item.type,
		status: item.status,
		error: item.error,
		page_count: item.page_count,
		chunk_count: item.chunk_count,
		updated_at: item.updated_at,
	};
}
