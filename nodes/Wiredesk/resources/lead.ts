import type { INodeProperties } from 'n8n-workflow';
import { paginationFields, unwrapData } from '../shared/descriptions';

const forLead = { resource: ['lead'] };
const forOperations = (...operation: string[]) => ({ ...forLead, operation });

export const leadDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forLead },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many leads',
				description: 'List the leads agents captured, newest first',
				routing: { request: { method: 'GET', url: '/leads' }, ...unwrapData },
			},
		],
		default: 'getAll',
	},
	...paginationFields(forOperations('getAll')),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: forOperations('getAll') },
		options: [
			{
				displayName: 'Agent Name or ID',
				name: 'agent_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAgentOptions' },
				default: '',
				description:
					'Only leads this agent captured. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				routing: { send: { type: 'query', property: 'agent_id' } },
			},
		],
	},
];
