import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { getAgentOptions, getAgents } from './listSearch/getAgents';
import { agentDescription } from './resources/agent';
import { contactDescription } from './resources/contact';
import { conversationDescription } from './resources/conversation';
import { knowledgeSourceDescription } from './resources/knowledgeSource';
import { leadDescription } from './resources/lead';
import { webhookDescription } from './resources/webhook';
import { workspaceDescription } from './resources/workspace';
import { BASE_URL } from './shared/transport';

/**
 * Wiredesk's public REST API (https://wiredesk.ai/docs/api-reference) as a
 * declarative node: every operation is one endpoint, and every field is one
 * of that endpoint's documented parameters.
 */
export class Wiredesk implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Wiredesk',
		name: 'wiredesk',
		icon: { light: 'file:../../icons/wiredesk.svg', dark: 'file:../../icons/wiredesk.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Talk to Wiredesk AI agents, manage contacts, knowledge and webhook endpoints, and read conversations and leads',
		defaults: {
			name: 'Wiredesk',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'wiredeskApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: BASE_URL,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Agent', value: 'agent' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Conversation', value: 'conversation' },
					{ name: 'Knowledge Source', value: 'knowledgeSource' },
					{ name: 'Lead', value: 'lead' },
					{ name: 'Webhook', value: 'webhook' },
					{ name: 'Workspace', value: 'workspace' },
				],
				default: 'agent',
			},
			...agentDescription,
			...contactDescription,
			...conversationDescription,
			...knowledgeSourceDescription,
			...leadDescription,
			...webhookDescription,
			...workspaceDescription,
		],
	};

	methods = {
		listSearch: {
			getAgents,
		},
		loadOptions: {
			getAgentOptions,
		},
	};
}
