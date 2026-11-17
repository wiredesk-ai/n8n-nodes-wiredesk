import type { INodeProperties } from 'n8n-workflow';
import { agentSelect, deleteOutput, paginationFields, unwrapData } from '../shared/descriptions';

const forAgent = { resource: ['agent'] };
const forOperations = (...operation: string[]) => ({ ...forAgent, operation });

export const agentDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forAgent },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create agent',
				description:
					'Create a new agent from a name and instructions, set up the way the dashboard’s New agent form sets one up',
				routing: {
					request: { method: 'POST', url: '/agents' },
					...unwrapData,
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete agent',
				description:
					'Delete an agent. It stops answering at once, and an owner can restore it from the dashboard for 30 days.',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/agents/{{ encodeURIComponent($parameter.agentId) }}',
					},
					...deleteOutput,
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get agent',
				description: 'Retrieve an agent, with its name, greeting, instructions and channels',
				routing: {
					request: { method: 'GET', url: '=/agents/{{ encodeURIComponent($parameter.agentId) }}' },
					...unwrapData,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many agents',
				description: 'Retrieve a list of the workspace’s agents, newest first',
				routing: {
					request: { method: 'GET', url: '/agents' },
					...unwrapData,
				},
			},
			{
				name: 'Send Message',
				value: 'sendMessage',
				action: 'Send message to agent',
				description:
					'Send a customer’s message to an agent and get its reply, as the chat widget does',
				routing: {
					request: {
						method: 'POST',
						url: '=/agents/{{ encodeURIComponent($parameter.agentId) }}/chat',
					},
					...unwrapData,
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update agent',
				description: 'Update an agent’s name, greeting or instructions',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/agents/{{ encodeURIComponent($parameter.agentId) }}',
					},
					...unwrapData,
				},
			},
		],
		default: 'sendMessage',
	},
	agentSelect(forOperations('delete', 'get', 'sendMessage', 'update')),
	...paginationFields(forOperations('getAll')),
	{
		displayName: 'Name',
		name: 'agentName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Front Desk',
		displayOptions: { show: forOperations('create') },
		description: 'The agent’s name. Up to 80 characters.',
		routing: { send: { type: 'body', property: 'name' } },
	},
	{
		displayName: 'Instructions',
		name: 'instructions',
		type: 'string',
		typeOptions: { rows: 6 },
		required: true,
		default: '',
		displayOptions: { show: forOperations('create') },
		description: 'Who the agent is and how it answers. Up to 4,000 characters.',
		routing: { send: { type: 'body', property: 'instructions' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'createFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forOperations('create') },
		options: [
			{
				displayName: 'Greeting',
				name: 'greeting',
				type: 'string',
				default: '',
				description:
					'The first thing the agent says when it picks up a call. Up to 300 characters. “Thanks for calling — how can I help?” if left empty.',
				routing: { send: { type: 'body', property: 'greeting' } },
			},
		],
	},
	{
		displayName: 'Message',
		name: 'message',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		displayOptions: { show: forOperations('sendMessage') },
		description: 'What the customer says. Up to 2,000 characters.',
		routing: { send: { type: 'body', property: 'message' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forOperations('sendMessage') },
		options: [
			{
				displayName: 'Conversation ID',
				name: 'conversation_id',
				type: 'string',
				default: '',
				description:
					"The 'conversation_id' an earlier Send Message returned, to continue that conversation. Leave empty to start a new one.",
				routing: { send: { type: 'body', property: 'conversation_id' } },
			},
			{
				displayName: 'User ID',
				name: 'user_id',
				type: 'string',
				default: '',
				description:
					'Your own ID for the person, so all their conversations share one contact. Letters, digits and . _ - @ : + only.',
				routing: { send: { type: 'body', property: 'user_id' } },
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				placeholder: 'e.g. Nathan Smith',
				description: 'The person’s name, stored on their contact if it has none yet',
				routing: { send: { type: 'body', property: 'name' } },
			},
		],
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forOperations('update') },
		options: [
			{
				displayName: 'Greeting',
				name: 'greeting',
				type: 'string',
				default: '',
				description:
					'The first thing the agent says when it picks up a call. Up to 300 characters.',
				routing: { send: { type: 'body', property: 'greeting' } },
			},
			{
				displayName: 'Instructions',
				name: 'instructions',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				description: 'Who the agent is and how it answers. Up to 4,000 characters.',
				routing: { send: { type: 'body', property: 'instructions' } },
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'The agent’s name. Up to 80 characters.',
				routing: { send: { type: 'body', property: 'name' } },
			},
		],
	},
];
