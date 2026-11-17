import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';
import { type AgentPage, wiredeskApiRequest } from '../shared/transport';

async function agentPage(this: ILoadOptionsFunctions, cursor?: string): Promise<AgentPage> {
	const qs = cursor ? { limit: 100, cursor } : { limit: 100 };
	return (await wiredeskApiRequest.call(this, 'GET', '/agents', qs)) as unknown as AgentPage;
}

/** The Agent picker: the workspace's agents, a page at a time, filtered by name. */
export async function getAgents(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const page = await agentPage.call(this, paginationToken);
	const needle = filter?.trim().toLowerCase();
	const agents = needle
		? page.data.filter(
				(agent) => agent.name.toLowerCase().includes(needle) || agent.id === filter?.trim(),
			)
		: page.data;
	return {
		results: agents.map((agent) => ({
			name: agent.name,
			value: agent.id,
			url: `https://console.wiredesk.ai/agents/${agent.id}`,
		})),
		paginationToken: page.has_more && page.next_cursor ? page.next_cursor : undefined,
	};
}

/** The agent filter's dropdown: every agent in the workspace. */
export async function getAgentOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const options: INodePropertyOptions[] = [];
	let cursor: string | undefined;
	do {
		const page = await agentPage.call(this, cursor);
		for (const agent of page.data) options.push({ name: agent.name, value: agent.id });
		cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
	} while (cursor);
	return options;
}
