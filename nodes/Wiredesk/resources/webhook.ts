import type { INodeProperties } from 'n8n-workflow';
import { deleteOutput, unwrapData } from '../shared/descriptions';

const forWebhook = { resource: ['webhook'] };
const forOperations = (...operation: string[]) => ({ ...forWebhook, operation });

/**
 * The workspace's webhook endpoints: subscribe a URL to events, list them,
 * remove one. Adding and removing take a full-access key.
 */
export const webhookDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forWebhook },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create webhook endpoint',
				description:
					'Create a new webhook endpoint that sends the chosen events to an https URL. Returns its ID and its signing secret, which is shown only this once.',
				routing: { request: { method: 'POST', url: '/webhooks' }, ...unwrapData },
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete webhook endpoint',
				description: 'Delete a webhook endpoint permanently. Nothing more is sent to it.',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/webhooks/{{ encodeURIComponent($parameter.webhookId) }}',
					},
					...deleteOutput,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many webhook endpoints',
				description:
					'Retrieve a list of the workspace’s webhook endpoints, without their signing secrets',
				routing: { request: { method: 'GET', url: '/webhooks' }, ...unwrapData },
			},
		],
		default: 'create',
	},
	{
		displayName: 'Webhook Endpoint ID',
		name: 'webhookId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: forOperations('delete') },
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://hooks.example.com/wiredesk',
		displayOptions: { show: forOperations('create') },
		description: 'Where to send the events: https, on a public host',
		routing: { send: { type: 'body', property: 'url' } },
	},
	{
		displayName: 'Events',
		name: 'events',
		type: 'multiOptions',
		required: true,
		options: [
			{
				name: 'Conversation Ended',
				value: 'conversation.ended',
				description: 'A conversation closed and was summarised',
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
				description: 'A customer, the agent or someone on the team wrote in a chat or email',
			},
		],
		default: [],
		displayOptions: { show: forOperations('create') },
		description: 'The events to send to the URL',
		routing: { send: { type: 'body', property: 'events' } },
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		default: '',
		displayOptions: { show: forOperations('create') },
		description: 'What the endpoint is for, shown in the dashboard',
		routing: { send: { type: 'body', property: 'description' } },
	},
];
