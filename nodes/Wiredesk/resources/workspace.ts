import type { INodeProperties } from 'n8n-workflow';
import { unwrapData } from '../shared/descriptions';

const forWorkspace = { resource: ['workspace'] };
const forOperations = (...operation: string[]) => ({ ...forWorkspace, operation });

/** How many days back from now, 1 to 90: the Analytics page's longest range. */
function daysField(operation: string, fallback: number): INodeProperties {
	return {
		displayName: 'Days',
		name: 'days',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 90 },
		default: fallback,
		displayOptions: { show: forOperations(operation) },
		description: 'How many days back from now to count, from 1 to 90',
		routing: { send: { type: 'query', property: 'days' } },
	};
}

export const workspaceDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forWorkspace },
		options: [
			{
				name: 'Get Analytics',
				value: 'getAnalytics',
				action: 'Get analytics',
				description:
					'Resolution and handover rates, ratings, time to a person, hours saved, leads, outcomes, sentiment and topics, beside the period before',
				routing: { request: { method: 'GET', url: '/analytics' }, ...unwrapData },
			},
			{
				name: 'Get Dashboard',
				value: 'getDashboard',
				action: 'Get the dashboard',
				description:
					'The workspace at a glance: agents, headline numbers, what needs a person and the latest conversations',
				routing: { request: { method: 'GET', url: '/dashboard' }, ...unwrapData },
			},
			{
				name: 'Who Am I',
				value: 'whoami',
				action: 'Get who the API key belongs to',
				description:
					'The workspace, its plan and this month’s usage, and whether the key may make changes',
				routing: { request: { method: 'GET', url: '/whoami' }, ...unwrapData },
			},
		],
		default: 'getAnalytics',
	},
	daysField('getAnalytics', 30),
	daysField('getDashboard', 7),
	{
		displayName: 'Filters',
		name: 'analyticsFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: forOperations('getAnalytics') },
		options: [
			{
				displayName: 'Agent Name or ID',
				name: 'agent_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAgentOptions' },
				default: '',
				description:
					'Only this agent’s numbers. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				routing: { send: { type: 'query', property: 'agent_id' } },
			},
		],
	},
];
