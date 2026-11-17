import type { INodeProperties } from 'n8n-workflow';
import { agentSelect, paginationFields, unwrapData } from '../shared/descriptions';

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
				action: 'Create an agent',
				description:
					'Create an agent from a name and instructions, set up as the dashboard’s New agent form sets one up',
				routing: {
					request: { method: 'POST', url: '/agents' },
					...unwrapData,
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete an agent',
				description:
					'Delete an agent. It stops answering at once; an owner can restore it from the dashboard for 30 days.',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/agents/{{ encodeURIComponent($parameter.agentId) }}',
					},
					...unwrapData,
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get an agent',
				description: 'Get an agent: its name, greeting, instructions and channels',
				routing: {
					request: { method: 'GET', url: '=/agents/{{ encodeURIComponent($parameter.agentId) }}' },
					...unwrapData,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many agents',
				description: 'List the workspace’s agents, newest first',
				routing: {
					request: { method: 'GET', url: '/agents' },
					...unwrapData,
				},
			},
			{
				name: 'Send Message',
				value: 'sendMessage',
				action: 'Send a message to an agent',
				description:
					'Send a customer’s message to an agent and get its reply, like the chat widget does',
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
				action: 'Update an agent',
				description: 'Change an agent’s name, greeting or instructions',
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
					'Continue this conversation: the conversation_id an earlier Send Message returned. Leave empty to start a new one.',
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
