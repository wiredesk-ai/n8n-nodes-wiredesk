import type {
	IDataObject,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

export const BASE_URL = 'https://wiredesk.ai/api/v1';

/** One request to the Wiredesk API with the node's credential. */
export async function wiredeskApiRequest(
	this: ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	path: string,
	qs: IDataObject = {},
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${path}`,
		qs,
		json: true,
	};
	return (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'wiredeskApi',
		options,
	)) as IDataObject;
}

export interface AgentSummary {
	id: string;
	name: string;
}

export interface AgentPage {
	data: AgentSummary[];
	next_cursor: string | null;
	has_more: boolean;
}
