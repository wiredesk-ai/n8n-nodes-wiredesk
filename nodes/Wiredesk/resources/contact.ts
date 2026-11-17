import type { INodeProperties } from 'n8n-workflow';
import { deleteOutput, paginationFields, unwrapData } from '../shared/descriptions';

const forContact = { resource: ['contact'] };
const forOperations = (...operation: string[]) => ({ ...forContact, operation });
const contactUrl = '=/contacts/{{ encodeURIComponent($parameter.contactId) }}';

export const contactDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forContact },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create contact',
				description:
					'Create a new contact from a phone number or email address, with the name agents should use',
				routing: { request: { method: 'POST', url: '/contacts' }, ...unwrapData },
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete contact',
				description:
					'Delete a contact permanently, with the notes agents kept about them. Their conversations stay.',
				routing: { request: { method: 'DELETE', url: contactUrl }, ...deleteOutput },
			},
			{
				name: 'Find',
				value: 'find',
				action: 'Find contact by email or phone',
				description:
					'Retrieve the contact with an email address or phone number. Returns nothing when there is none.',
				routing: { request: { method: 'GET', url: '/contacts', qs: { limit: 1 } }, ...unwrapData },
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get contact',
				description: 'Retrieve a contact, with when they were first and last seen',
				routing: { request: { method: 'GET', url: contactUrl }, ...unwrapData },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many contacts',
				description:
					'Retrieve a list of contacts: the people who have talked to the workspace’s agents, newest first',
				routing: { request: { method: 'GET', url: '/contacts' }, ...unwrapData },
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update contact',
				description: 'Update a contact’s name',
				routing: { request: { method: 'PATCH', url: contactUrl }, ...unwrapData },
			},
		],
		default: 'create',
	},
	{
		displayName: 'Contact ID',
		name: 'contactId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: forOperations('delete', 'get', 'update') },
	},
	{
		displayName: 'Kind',
		name: 'kind',
		type: 'options',
		required: true,
		options: [
			{ name: 'Email', value: 'email' },
			{ name: 'Phone', value: 'phone' },
		],
		default: 'email',
		displayOptions: { show: forOperations('create') },
		routing: { send: { type: 'body', property: 'kind' } },
	},
	{
		displayName: 'Value',
		name: 'value',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. nathan@example.com or +14155550123',
		displayOptions: { show: forOperations('create') },
		description: 'The email address, or the phone number in international format',
		routing: { send: { type: 'body', property: 'value' } },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		placeholder: 'e.g. Nathan Smith',
		displayOptions: { show: forOperations('create') },
		description: 'The name agents should know them by',
		routing: { send: { type: 'body', property: 'name' } },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		placeholder: 'e.g. Nathan Smith',
		displayOptions: { show: forOperations('update') },
		description: 'The contact’s new name. Leave empty to clear it.',
		routing: { send: { type: 'body', property: 'name' } },
	},
	{
		displayName: 'Find By',
		name: 'findBy',
		type: 'options',
		options: [
			{ name: 'Email', value: 'email' },
			{ name: 'Phone', value: 'phone' },
		],
		default: 'email',
		displayOptions: { show: forOperations('find') },
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'e.g. nathan@example.com',
		required: true,
		default: '',
		displayOptions: { show: { ...forOperations('find'), findBy: ['email'] } },
		description: 'The email address. Case does not matter.',
		routing: { send: { type: 'query', property: 'email' } },
	},
	{
		displayName: 'Phone',
		name: 'phone',
		type: 'string',
		placeholder: 'e.g. +14155550123',
		required: true,
		default: '',
		displayOptions: { show: { ...forOperations('find'), findBy: ['phone'] } },
		description:
			'The phone number in international format. Spaces and punctuation do not matter, and ten digits are read as a US number.',
		routing: { send: { type: 'query', property: 'phone' } },
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
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'e.g. nathan@example.com',
				default: '',
				description: 'Only the contact with this email address. Case does not matter.',
				routing: { send: { type: 'query', property: 'email' } },
			},
			{
				displayName: 'Kind',
				name: 'kind',
				type: 'options',
				options: [
					{ name: 'API', value: 'api', description: 'People your code talked to through the API' },
					{ name: 'Email', value: 'email' },
					{ name: 'Phone', value: 'phone' },
					{
						name: 'User',
						value: 'user',
						description: 'Team members testing an agent in the dashboard',
					},
					{ name: 'Visitor', value: 'visitor', description: 'Website chat visitors' },
				],
				default: 'email',
				routing: { send: { type: 'query', property: 'kind' } },
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				placeholder: 'e.g. +14155550123',
				default: '',
				description:
					'Only the contact with this phone number, in international format. Spaces and punctuation do not matter.',
				routing: { send: { type: 'query', property: 'phone' } },
			},
		],
	},
];
