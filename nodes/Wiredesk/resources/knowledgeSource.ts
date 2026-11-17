import type { INodeProperties } from 'n8n-workflow';
import {
	agentSelect,
	deleteOutput,
	paginationFields,
	simplifyField,
	unwrapData,
} from '../shared/descriptions';
import { simplifyKnowledgeSource } from '../shared/output';

const forKnowledge = { resource: ['knowledgeSource'] };
const forOperations = (...operation: string[]) => ({ ...forKnowledge, operation });
const knowledgeUrl = '=/agents/{{ encodeURIComponent($parameter.agentId) }}/knowledge';

export const knowledgeSourceDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forKnowledge },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create knowledge source',
				description:
					'Create a new knowledge source to teach an agent: pasted text is ready at once, a website is crawled and comes back pending',
				routing: { request: { method: 'POST', url: knowledgeUrl }, ...unwrapData },
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete knowledge source',
				description:
					'Delete a knowledge source permanently. The agent stops answering from it straight away.',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/agents/{{ encodeURIComponent($parameter.agentId) }}/knowledge/{{ encodeURIComponent($parameter.sourceId) }}',
					},
					...deleteOutput,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many knowledge sources',
				description:
					'Retrieve a list of an agent’s knowledge sources, with whether each is ready to answer from',
				routing: { request: { method: 'GET', url: knowledgeUrl }, ...unwrapData },
			},
			{
				name: 'Search',
				value: 'search',
				action: 'Search knowledge sources',
				description:
					'Find the passages in an agent’s knowledge sources that the agent itself would find for a question',
				routing: {
					request: {
						method: 'GET',
						url: '=/agents/{{ encodeURIComponent($parameter.agentId) }}/knowledge/search',
					},
					...unwrapData,
				},
			},
		],
		default: 'create',
	},
	agentSelect(forOperations('create', 'delete', 'getAll', 'search')),
	{
		displayName: 'Knowledge Source ID',
		name: 'sourceId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: forOperations('delete') },
		description: 'The knowledge source to delete, from Get Many',
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		required: true,
		options: [
			{ name: 'Text', value: 'text', description: 'Pasted text, indexed before the response' },
			{
				name: 'Website',
				value: 'url',
				description: 'A website to crawl. Comes back pending; the crawl takes minutes.',
			},
		],
		default: 'text',
		displayOptions: { show: forOperations('create') },
		routing: { send: { type: 'body', property: 'type' } },
	},
	{
		displayName: 'Content',
		name: 'content',
		type: 'string',
		typeOptions: { rows: 6 },
		required: true,
		default: '',
		displayOptions: { show: { ...forOperations('create'), type: ['text'] } },
		description: 'The text to teach. Up to 200,000 characters.',
		routing: { send: { type: 'body', property: 'content' } },
	},
	{
		displayName: 'Label',
		name: 'label',
		type: 'string',
		default: '',
		placeholder: 'e.g. Returns policy',
		displayOptions: { show: { ...forOperations('create'), type: ['text'] } },
		description: 'What to call the text on the agent’s Knowledge page. “Pasted text” if empty.',
		routing: { send: { type: 'body', property: 'label' } },
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com',
		displayOptions: { show: { ...forOperations('create'), type: ['url'] } },
		description: 'The website to crawl',
		routing: { send: { type: 'body', property: 'url' } },
	},
	{
		displayName: 'Query',
		name: 'q',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. What is the returns policy?',
		displayOptions: { show: forOperations('search') },
		description: 'The question or words to look for',
		routing: { send: { type: 'query', property: 'q' } },
	},
	...paginationFields(forOperations('getAll')),
	simplifyField(forOperations('getAll'), simplifyKnowledgeSource),
];
