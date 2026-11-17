# n8n-nodes-wiredesk

This is an n8n community node package: the **Wiredesk** node and the **Wiredesk Trigger**. They let you use [Wiredesk](https://wiredesk.ai) in your n8n workflows.

Wiredesk runs AI agents that answer customers on website chat, phone, email and WhatsApp, using your knowledge base and actions, with a handoff to your team when it's needed. With these nodes you can start a workflow the moment a conversation ends or a lead is captured, talk to an agent, keep its knowledge up to date, manage contacts, and read conversations and leads.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Example workflows](#example-workflows)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is `n8n-nodes-wiredesk`.

## Operations

| Resource         | Operations                                                         |
| ---------------- | ------------------------------------------------------------------ |
| Agent            | Create, Delete, Get, Get Many, Send Message, Update (name, greeting, instructions) |
| Contact          | Create, Delete, Find (by email or phone), Get, Get Many (filter by kind, email or phone), Update (name) |
| Conversation     | Export (date range, with transcripts), Get, Get Inbox, Get Many (filter by agent, channel), Get Messages, Search, Update (Take Over or Hand Back) |
| Knowledge Source | Create (text or website), Delete, Get Many, Search                 |
| Lead             | Get Many (filter by agent)                                         |
| Webhook Endpoint | Create (URL and events; returns the signing secret once), Delete, Get Many |
| Workspace        | Get Analytics, Get Dashboard, Who Am I                             |

Each operation is one endpoint of the [Wiredesk REST API](https://wiredesk.ai/docs/api-reference/introduction). Every "Get Many" has **Return All**, which follows the API's cursor through every page. The node can also be used as a tool by n8n's AI Agent.

- **Simplify** (on by default) trims conversations, inbox items and knowledge sources to their ten most used fields, with the contact flattened into `contact_name` and `contact_value`. Turn it off for everything the API returns. It's on Conversation → Get, Get Inbox, Get Many and Search, and Knowledge Source → Get Many.
- Every **Delete** outputs one item, `{ "deleted": true }`.
- When Wiredesk refuses a request, the node says what happened and how to fix it, names the field to check when it can, adds `[item N]`, and ends with the API's code, for example `(Wiredesk code: read_only_key)`.

Nodes added with 0.1.1 or earlier (node version 1) keep their output exactly: no Simplify, and Delete returns the API's `{ id, object, deleted }`. New nodes are version 1.1.

### Wiredesk Trigger

Starts a workflow the moment one of the chosen events happens: **Conversation Ended**, **Handover Requested**, **Lead Captured** or **Message Created**. It doesn't poll.

- Activating the workflow adds a webhook endpoint in Wiredesk (`POST /webhooks`) for the node's URL, described as `n8n: <node name>`. The endpoint's id and signing secret are kept in the node's static data, one entry per webhook URL, so **Listen for test event** on an active workflow adds a second endpoint for the test URL and removes only that one when it stops. Deactivating or deleting the workflow removes the production endpoint (`DELETE /webhooks/{id}`; a 404 means it was already gone). If the endpoint was removed or switched off in the dashboard, or the events changed, the next activation replaces it.
- It needs a **Full access** key, and each active trigger uses one of the workspace's 10 webhook endpoints.
- Every delivery's [Standard Webhooks](https://www.standardwebhooks.com) signature is checked against the stored secret, over the raw body. A mismatch, a missing signature, or a timestamp more than five minutes off is answered `401` and starts nothing. The dashboard's **Send test event** is answered `200` and starts nothing.
- Each run's item is the event as sent (`type`, `timestamp`, `data`) plus `delivery_id`, the `webhook-id` header, which stays the same across retries.
- Wiredesk sends only to `https` URLs on a public host, so a local n8n needs a tunnel.

See [Webhooks](https://wiredesk.ai/docs/developers/webhooks) for what `data` holds for each event.

## Credentials

1. In Wiredesk, open **Developers → API keys** and make a key. Only workspace owners and admins see the Developers section.
   - A **Full access** key can run every operation.
   - A **Read only** key can run every Find, Get, Get Many, Search and Export, and Who Am I. Any change gets `403 read_only_key`, and so does activating a Wiredesk Trigger.
2. In n8n, create a **Wiredesk API** credential and paste the key. It starts with `wd_`. n8n tests it by listing your agents.

A key works only while the person who made it is still an owner or admin of the workspace.

## Compatibility

Built with `@n8n/node-cli` 0.56 against `n8n-workflow` 2.x, for current n8n releases. Self-hosted n8n needs community nodes enabled.

## Usage

- **Send Message** runs the same agent as the chat widget, with the same instructions, knowledge, actions and handoff, and is billed as a chat reply. Leave **Conversation ID** empty to start a conversation. To continue it, pass the `conversation_id` the first reply returned. Set **User ID** to your own ID for the person, so all their conversations share one contact.
- If someone on your team has taken the conversation over, `reply` is `null` and `handover_state` is `active`.
- **Knowledge Source → Create** with **Text** returns the source `ready`. With **Website** it returns `pending` while the site is crawled. **Get Many** shows when it is ready.
- **Contact → Update** with an empty name clears the name.
- **Conversation → Search** matches the customer's name, number or email, plus topic, summary, outcome and channel. It's the same search as the Conversations page.

## Example workflows

Four short recipes. Each lists the nodes in order and the settings that matter; anything not mentioned can stay as it is.

### Post every finished conversation to Slack

1. **Wiredesk Trigger**. Events: **Conversation Ended**.
2. **Slack → Send Message**. Channel: your support channel. Message:

   ```text
   {{ $json.data.conversation.channel }} conversation with {{ $json.data.conversation.contact.name || $json.data.conversation.contact.value }}
   Outcome: {{ $json.data.conversation.outcome }} · Sentiment: {{ $json.data.conversation.sentiment }}
   {{ $json.data.conversation.summary }}
   https://console.wiredesk.ai/conversations/{{ $json.data.conversation.id }}
   ```

Every conversation, on every channel, lands in Slack with its summary and outcome a few minutes after it ends. Add an **If** node between the two, on `{{ $json.data.conversation.outcome }}`, to post only the ones that weren't resolved.

### Send captured leads to HubSpot

1. **Wiredesk Trigger**. Events: **Lead Captured**.
2. **HubSpot → Contact → Create or Update**. Email: `{{ $json.data.lead.email }}`. Additional fields: First Name `{{ $json.data.lead.name }}`, Phone Number `{{ $json.data.lead.phone }}`.

Each lead an agent captures with a **Capture leads** action becomes a HubSpot contact straight away. Any other field the action asks for is in `{{ $json.data.lead.fields }}`. The same pattern works with Pipedrive, Salesforce or a Google Sheets **Append Row**.

### Keep an agent's knowledge up to date

1. **Schedule Trigger**, every week, or **Google Drive Trigger** on **File Updated** for a document your team edits.
2. **Google Drive → File → Download** for the document, then **Extract from File** to get its text. (A Google Doc can use **Google Docs → Get** instead.)
3. **Wiredesk → Knowledge Source → Create**, named `Add new copy`. Agent: from the list. Type: **Text**. Content: `{{ $json.data }}` (the extracted text). Label: the document's name, for example `Returns policy`.
4. **Wiredesk → Knowledge Source → Get Many**. Agent: the same one. Return All: on. Simplify: on.
5. **Filter**: `{{ $json.label }}` is equal to `Returns policy`, and `{{ $json.id }}` is not equal to `{{ $('Add new copy').first().json.id }}`.
6. **Wiredesk → Knowledge Source → Delete**. Agent: the same one. Knowledge Source ID: `{{ $json.id }}`.

The new copy is live before the old one is deleted, so the agent is never without it. For a website, use Type **Website** with its URL instead: it comes back `pending`, and **Get Many** shows `ready` when the crawl is done.

### Let n8n's AI Agent, or a form, ask a Wiredesk agent

1. **When chat message received** (for n8n's **AI Agent**) or **n8n Form Trigger** with a **Question** field.
2. With the AI Agent: add **Wiredesk** as a tool. Resource: **Agent**. Operation: **Send Message**. Agent: from the list. Message: `{{ $fromAI('message', 'The customer question to answer') }}`. With a form: add **Wiredesk → Agent → Send Message** after the trigger, with Message `{{ $json.Question }}`.
3. Optional: under **Additional Fields**, set **User ID** to the person's own ID (an email, say) so their conversations share one Wiredesk contact, and **Conversation ID** to an earlier reply's `conversation_id` to continue that conversation.

The answer is in `{{ $json.reply }}`, written by the same agent as your chat widget, with the same knowledge, actions and handoff. Each reply is billed as a chat reply. If someone on your team has taken the conversation over, `reply` is `null`.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Wiredesk n8n guide](https://wiredesk.ai/docs/integrations/n8n)
- [Wiredesk API reference](https://wiredesk.ai/docs/api-reference/introduction)

## Development

```bash
npm install
npm run lint    # n8n's community-node ESLint rules
npm test        # builds, then checks every operation against the API's OpenAPI spec, and the trigger against stand-ins for n8n
npm run dev     # n8n at http://localhost:5678 with this node loaded
```

The source lives in the Wiredesk monorepo at `integrations/n8n-nodes-wiredesk`. There, `npm test` reads `apps/docs/api-reference/openapi.json` and fails if:

- an operation calls an endpoint that doesn't exist,
- an operation sends a field the endpoint doesn't document,
- a required parameter has no field,
- an endpoint other than agent onboarding has no operation.

In the public mirror those two spec checks skip.

## Releasing

n8n accepts a community node for verification only if it was published from GitHub Actions with npm provenance, from a public repository that matches `repository.url` in `package.json`. The Wiredesk monorepo is private, so this folder is mirrored to the public repository [wiredesk-ai/n8n-nodes-wiredesk](https://github.com/wiredesk-ai/n8n-nodes-wiredesk), and npm publishes from there through Trusted Publishing (GitHub OIDC). There's no npm token anywhere.

The package belongs to the npm account `wiredesk` (admin@wiredesk.ai), which uses a passkey for two-factor authentication. 0.1.0 was published from a laptop without provenance. Every later version comes from the mirror's `publish.yml`.

### One-time setup (done)

1. The public repository `wiredesk-ai/n8n-nodes-wiredesk`, starting from a single snapshot commit of this folder. The monorepo's history isn't copied, because its commit messages describe private code.
2. On npmjs.com, the package's **Settings → Trusted Publisher**: GitHub Actions, owner `wiredesk-ai`, repository `n8n-nodes-wiredesk`, workflow `publish.yml`, no environment.

### Release a version

1. In the monorepo, change the code here and bump `version` in `package.json` (and `package-lock.json`: `npm version <x.y.z> --no-git-tag-version`). Merge to `main` as usual.
2. Copy the folder into a clone of the mirror, commit, tag and push:

   ```bash
   git clone git@github.com:wiredesk-ai/n8n-nodes-wiredesk.git /tmp/n8n-mirror
   rsync -a --delete --exclude .git --exclude node_modules --exclude dist \
     integrations/n8n-nodes-wiredesk/ /tmp/n8n-mirror/
   cd /tmp/n8n-mirror
   git add -A && git commit -m "<x.y.z>: <what changed>"
   git tag <x.y.z> && git push origin main <x.y.z>
   ```

   The tag runs `.github/workflows/publish.yml`, which lints, builds and publishes with provenance. Don't run `npm run release` locally: its version bump would happen in the mirror and drift from the monorepo.
3. Check it: `npx @n8n/scan-community-package n8n-nodes-wiredesk` should pass, including provenance. Then install it in an n8n instance (**Settings → Community nodes → Install**) and run one operation of each resource.

### Submit for verification

1. Sign in at <https://creators.n8n.io/nodes> and submit `n8n-nodes-wiredesk`.
2. n8n reviews it against its [verification guidelines](https://docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines/), which can take up to four weeks. They email as it moves through review. A verified node gets a badge and can be installed on n8n Cloud.

### Rollback

`npm deprecate n8n-nodes-wiredesk@<version> "<reason>"` warns anyone who installs that version. Then publish a fixed version. npm allows `npm unpublish` only within 72 hours of publishing.
