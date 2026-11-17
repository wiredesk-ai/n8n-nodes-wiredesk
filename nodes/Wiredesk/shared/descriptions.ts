import type { IDataObject, IDisplayOptions, INodeProperties } from 'n8n-workflow';

/**
 * Pieces every resource uses. The API lists newest first, in pages of up to
 * 100, with `has_more` and `next_cursor` on each page
 * (https://wiredesk.ai/docs/api-reference/conventions).
 */

/** Pick an agent from the workspace, or paste its ID. */
export function agentSelect(show: IDisplayOptions['show'], name = 'agentId'): INodeProperties {
	return {
		displayName: 'Agent',
		name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: { show },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select an agent...',
				typeOptions: {
					searchListMethod: 'getAgents',
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 2b0c6a4e-…',
			},
		],
	};
}

/**
 * The query string for every page of a Return All: the first request's own
 * (its filters), 100 to a page, and from the second page on the cursor the
 * last page handed back. n8n swaps in the whole `qs`, so the filters have to
 * be carried over here or the later pages would lose them.
 */
const nextPageQuery = (pageSize: number) =>
	`={{ Object.assign({}, $request.qs, { limit: ${pageSize} }, $response.body && $response.body.next_cursor ? { cursor: $response.body.next_cursor } : {}) }}`;

/**
 * Limit and Return All for a list endpoint: `limit` goes out as the page
 * size, and Return All follows `next_cursor` until `has_more` is false.
 * `pageSize` is the endpoint's largest page: 100, or 25 for an export,
 * whose every row carries its transcript.
 */
export function paginationFields(
	show: IDisplayOptions['show'],
	pageSize = 100,
): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			displayOptions: { show },
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			routing: {
				send: {
					paginate: '={{ $value }}',
				},
				operations: {
					pagination: {
						type: 'generic',
						properties: {
							continue: '={{ $response.body.has_more === true }}',
							request: {
								qs: nextPageQuery(pageSize) as unknown as IDataObject,
							},
						},
					},
				},
			},
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			displayOptions: { show: { ...show, returnAll: [false] } },
			typeOptions: { minValue: 1, maxValue: 100 },
			default: 50,
			description: 'Max number of results to return',
			routing: {
				// An endpoint with smaller pages gets at most one page's worth.
				send:
					pageSize < 100
						? { type: 'query', property: 'limit', value: `={{ Math.min($value, ${pageSize}) }}` }
						: { type: 'query', property: 'limit' },
				output: { maxResults: '={{ $value }}' },
			},
		},
	];
}

/** Every answer is `{ data: … }`; this hands n8n what is inside. */
export const unwrapData = {
	output: {
		postReceive: [{ type: 'rootProperty' as const, properties: { property: 'data' } }],
	},
};
