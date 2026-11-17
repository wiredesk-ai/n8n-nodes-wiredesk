import type { INodeProperties } from 'n8n-workflow';
import { paginationFields, simplifyField, unwrapData } from '../shared/descriptions';
import { simplifyConversation, simplifyInboxItem } from '../shared/output';

const forConversation = { resource: ['conversation'] };
const forOperations = (...operation: string[]) => ({ ...forConversation, operation });
const conversationUrl = '=/conversations/{{ encodeURIComponent($parameter.conversationId) }}';

/** The channels a conversation can be on, as the API names them. */
const CHANNELS = [
	{ name: 'Chat', value: 'chat' },
	{ name: 'Email', value: 'email' },
	{ name: 'Phone', value: 'phone' },
	{ name: 'Web Voice', value: 'web_voice' },
	{ name: 'WhatsApp', value: 'whatsapp' },
	{ name: 'Zendesk Messaging', value: 'zendesk_messaging' },
];

export const conversationDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forConversation },
		options: [
			{
				name: 'Export',
				value: 'export',
				action: 'Export conversations',
				description:
					'Retrieve the conversations that started in a date range, newest first, each with its transcript',
				routing: { request: { method: 'GET', url: '/conversations/export' }, ...unwrapData },
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get conversation',
				description: 'Retrieve a conversation, with its summary, outcome, topic and sentiment',
				routing: { request: { method: 'GET', url: conversationUrl }, ...unwrapData },
			},
			{
				name: 'Get Inbox',
				value: 'getInbox',
				action: 'Get inbox conversations',
				description:
					'List the conversations waiting on a person: chats that asked for one, chats taken over, and unread messages agents took',
				routing: { request: { method: 'GET', url: '/inbox' }, ...unwrapData },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many conversations',
				description: 'Retrieve a list of conversations across every channel, newest first',
				routing: { request: { method: 'GET', url: '/conversations' }, ...unwrapData },
			},
			{
				name: 'Get Messages',
				value: 'getMessages',
				action: 'Get conversation messages',
				description: 'List all messages in a conversation, oldest first, as its transcript reads',
				routing: {
					request: {
						method: 'GET',
						url: '=/conversations/{{ encodeURIComponent($parameter.conversationId) }}/messages',
					},
					...unwrapData,
				},
			},
			{
				name: 'Search',
				value: 'search',
				action: 'Search conversations',
				description:
					'Find conversations by the customer’s name, number or email, or by topic, summary, outcome or channel',
				routing: { request: { method: 'GET', url: '/conversations/search' }, ...unwrapData },
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Take over or hand back conversation',
				description:
					'Take over a chat, email or WhatsApp conversation so a person answers it, or hand it back to the agent',
				routing: { request: { method: 'PATCH', url: conversationUrl }, ...unwrapData },
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Conversation ID',
		name: 'conversationId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: forOperations('get', 'getMessages', 'update') },
	},
	{
		displayName: 'Handover',
		name: 'handover',
		type: 'options',
		required: true,
		options: [
			{
				name: 'Take Over',
				value: 'claim',
				description:
					'Take the conversation over in the name of the person who made the API key: the agent stops answering and a person replies from the dashboard',
			},
			{
				name: 'Hand Back',
				value: 'release',
				description: 'Hand the conversation back to the agent',
			},
		],
		default: 'claim',
		displayOptions: { show: forOperations('update') },
		description: 'A takeover nobody answers is handed back to the agent after 30 minutes',
		routing: { send: { type: 'body', property: 'handover' } },
	},
	{
		displayName: 'From',
		name: 'from',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: { show: forOperations('export') },
		description: 'Export the conversations that started from this date or time on',
		routing: { send: { type: 'query', property: 'from' } },
	},
	...paginationFields(forOperations('export'), 25),
	{
		displayName: 'Options',
		name: 'exportOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: forOperations('export') },
		options: [
			{
				displayName: 'Agent Name or ID',
				name: 'agent_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAgentOptions' },
				default: '',
				description:
					'Only this agent’s conversations. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				routing: { send: { type: 'query', property: 'agent_id' } },
			},
			{
				displayName: 'Channel',
				name: 'channel',
				type: 'options',
				options: CHANNELS,
				default: 'chat',
				routing: { send: { type: 'query', property: 'channel' } },
			},
			{
				displayName: 'To',
				name: 'to',
				type: 'dateTime',
				default: '',
				description: 'Up to, but not including, this date or time. Now if empty.',
				routing: { send: { type: 'query', property: 'to' } },
			},
		],
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: { show: forOperations('getInbox') },
		typeOptions: { minValue: 1, maxValue: 100 },
		default: 50,
		description: 'Max number of results to return',
		routing: {
			send: { type: 'query', property: 'limit' },
			output: { maxResults: '={{ $value }}' },
		},
	},
	{
		displayName: 'Filters',
		name: 'inboxFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: forOperations('getInbox') },
		options: [
			{
				displayName: 'Agent Name or ID',
				name: 'agent_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAgentOptions' },
				default: '',
				description:
					'Only what is waiting for this agent. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				routing: { send: { type: 'query', property: 'agent_id' } },
			},
		],
	},
	{
		displayName: 'Query',
		name: 'q',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. refund',
		displayOptions: { show: forOperations('search') },
		description: 'What to look for',
		routing: { send: { type: 'query', property: 'q' } },
	},
	...paginationFields(forOperations('getAll', 'getMessages', 'search')),
	simplifyField(forOperations('get', 'getAll', 'search'), simplifyConversation),
	simplifyField(forOperations('getInbox'), simplifyInboxItem),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: forOperations('getAll', 'search') },
		options: [
			{
				displayName: 'Agent Name or ID',
				name: 'agent_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAgentOptions' },
				default: '',
				description:
					'Only this agent’s conversations. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				routing: { send: { type: 'query', property: 'agent_id' } },
			},
			{
				displayName: 'Channel',
				name: 'channel',
				type: 'options',
				options: CHANNELS,
				default: 'chat',
				routing: { send: { type: 'query', property: 'channel' } },
			},
		],
	},
];
