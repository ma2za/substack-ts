# substack-ts

TypeScript wrapper and post utilities for the Substack API.

This is an unofficial library and is not affiliated with Substack.

If you are looking for the Python version, see `python-substack`:
https://github.com/ma2za/python-substack

## Install

```bash
npm install substack-ts
```

## Setup

You can configure credentials with environment variables (optionally via a `.env` file):

```bash
# Email/password auth
EMAIL=you@example.com
PASSWORD=your-password
PUBLICATION_URL=https://your-publication.substack.com

# Cookie auth (alternative)
COOKIES_PATH=./cookies.json
COOKIES_STRING="cookie1=value1; cookie2=value2"

# Example scripts also support these names
SUBSTACK_EMAIL=you@example.com
SUBSTACK_PASSWORD=your-password
SUBSTACK_PUBLICATION_URL=https://your-publication.substack.com
```

The `PUBLICATION_URL` / `SUBSTACK_PUBLICATION_URL` value is optional; if omitted, the API defaults to your primary publication.

### If you don't have a password

Some Substack accounts are created with magic-link login only. To set a password:

1. Sign out of Substack
2. At sign-in, click `Sign in with password`
3. Choose `Set a new password`

Keep `.env` out of source control and never commit secrets.

## Usage

### JavaScript

```js
const { Api, Post } = require("substack-ts");

async function main() {
	const api = new Api({
		email: "you@example.com",
		password: "your-password"
	});

	// Wait for auth and publication selection.
	await api.ready;

	const userId = await api.get_user_id();

	const post = new Post();
	post.setTitle("My Post");
	post.setSubtitle("Subtitle");
	post.paragraph("Hello from substack-ts");

	const draft = await api.post_draft(post.toDraft());
	console.log(draft.id);
}

main().catch(console.error);
```

### Cookie-based Authentication

```ts
import { Api } from "substack-ts";

async function main() {
	const api = new Api({
		cookies_path: process.env.COOKIES_PATH,
		// or: cookies_string: process.env.COOKIES_STRING,
		publication_url: process.env.PUBLICATION_URL
	});

	await api.ready;
	console.log(await api.get_user_id());
}

main().catch(console.error);
```

### Example: Subscriber Count

This example mirrors the Python flow of authenticating and fetching publication subscriber count.

```bash
npm run example:subscriber-count
```

Expected env vars for this example:

```bash
EMAIL=you@example.com
PASSWORD=your-password
PUBLICATION_URL=https://your-publication.substack.com

# also supported:
# SUBSTACK_EMAIL / SUBSTACK_PASSWORD / SUBSTACK_PUBLICATION_URL
```

### TypeScript

```ts
import { Api, Post } from "substack-ts";

async function main() {
	const api = new Api({
		email: "you@example.com",
		password: "your-password"
	});

	// Wait for auth and publication selection.
	await api.ready;

	const userId = await api.get_user_id();

	const post = new Post();
	post.setTitle("My Post");
	post.setSubtitle("Subtitle");
	post.paragraph("Hello from substack-ts");

	const draft = await api.post_draft(post.toDraft());
	console.log(draft.id);
}

main().catch(console.error);
```

## Exports

- `Api` - Main Substack API client
- `Post` - Fluent post builder for creating content
- `parseInline` / `parse_inline` - Markdown inline formatter parser
- `SubstackAPIException` - API-level exceptions
- `SubstackRequestException` - Request exceptions
- `SectionNotExistsException` - Missing section exception

## Example: Publishing from Markdown

The package includes an example script that demonstrates how to create and publish a Substack post from a Markdown file:

```bash
# Create draft (no publish)
npm run example:markdown -- -m README.md

# Create and publish draft
npm run example:markdown -- -m README.md --publish

# Use a different markdown file
npm run example:markdown -- -m my-post.md --publish
```

Set these environment variables (or .env file) for the example:

```bash
SUBSTACK_EMAIL=you@example.com
SUBSTACK_PASSWORD=your-password
```

The example:
1. Reads a Markdown file
2. Extracts the title from the first `#` heading
3. Parses Markdown (headings, paragraphs, bold, italic, links, code blocks, blockquotes, bullet lists, images)
4. Creates a draft post
5. Optionally publishes it

## Example: Publishing from YAML

The package also includes an example that publishes posts defined in YAML format. This is useful for version-controlling your posts and publishing programmatically:

```bash
# Create draft from YAML (no publish)
npm run example:yaml -- -p examples/draft.yaml

# Create and publish draft
npm run example:yaml -- -p examples/draft.yaml --publish

# Use a custom YAML file
npm run example:yaml -- -p my-post.yaml --publish
```

The YAML structure supports metadata and content definition. See documentation for details.

## Node Version

Requires Node 18+.

## Development

Build TypeScript to JavaScript:

```bash
npm run build
```
