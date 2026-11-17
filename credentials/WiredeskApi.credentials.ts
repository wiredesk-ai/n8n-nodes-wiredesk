import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WiredeskApi implements ICredentialType {
	name = 'wiredeskApi';

	displayName = 'Wiredesk API';

	icon: Icon = { light: 'file:../icons/wiredesk.svg', dark: 'file:../icons/wiredesk.dark.svg' };

	documentationUrl = 'https://wiredesk.ai/docs/integrations/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A key from Developers → API keys in Wiredesk. It starts with wd_. A read-only key can read but not change anything, and can’t activate the Wiredesk Trigger.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://wiredesk.ai/api/v1',
			url: '/agents',
			method: 'GET',
			qs: { limit: 1 },
		},
	};
}
