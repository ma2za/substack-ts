# substack-ts

This is an unofficial TypeScript library providing an interface for Substack.
I am in no way affiliated with Substack.

If you are looking for the Python version, see:
https://github.com/ma2za/python-substack

## Installation

```bash
npm install substack-ts
```

## Setup

Set the following environment variables in a `.env` file:

```dotenv
EMAIL=
PASSWORD=
PUBLICATION_URL=  # Optional: your publication URL
COOKIES_PATH=     # Optional: path to cookies JSON file
COOKIES_STRING=   # Optional: cookie string for authentication
```

The examples also accept these aliases:

```dotenv
SUBSTACK_EMAIL=
SUBSTACK_PASSWORD=
SUBSTACK_PUBLICATION_URL=
```

### If you don't have a password

Some Substack accounts only use magic-link login.

To set a password:

1. Sign out of Substack
2. At sign-in, click `Sign in with password` under the `Email` text box
3. Choose `Set a new password`

Keep `.env` out of source control and never commit secrets.

## Usage

### Basic Authentication

```ts
import { Api } from "substack-ts";

async function main() {
	const api = new Api({
		email: process.env.EMAIL,
		password: process.env.PASSWORD,
		publication_url: process.env.PUBLICATION_URL
	});

	await api.ready;
	console.log(await api.get_user_id());
}

main().catch(console.error);
```

### Cookie-based Authentication

```ts
import { Api } from "substack-ts";

async function main() {
	const api = new Api({
		cookies_path: process.env.COOKIES_PATH,
		// OR
		// cookies_string: process.env.COOKIES_STRING,
		publication_url: process.env.PUBLICATION_URL
	});

	await api.ready;
	console.log(await api.get_user_id());
}

main().catch(console.error);
```

### Creating and Publishing Posts

```ts
import { Api, Post } from "substack-ts";

async function main() {
	const api = new Api({
		email: process.env.EMAIL,
		password: process.env.PASSWORD,
		publication_url: process.env.PUBLICATION_URL
	});

	await api.ready;

	const userId = await api.get_user_id();

	const post = new Post(
		"How to publish a Substack post using the TypeScript API",
		"This post was published using the TypeScript API",
		userId,
		"everyone",
		"everyone"
	);

	post.add({ type: "paragraph", content: "This is how you add a new paragraph to your post!" });
	post.add({
		type: "paragraph",
		content: [
			{ content: "This is how you " },
			{ content: "bolden ", marks: [{ type: "strong" }] },
			{ content: "a word." }
		]
	});

	const image = await api.get_image("image.png");
	post.add({ type: "captionedImage", src: image.url || image.image_url });

	const embedded = await api.publication_embed("https://jackio.substack.com/");
	post.add({ type: "embeddedPublication", url: embedded });

	const markdownContent = `# My Heading\n\nThis is a paragraph with **bold** and *italic* text.`;
	await post.from_markdown(markdownContent, api);

	const draft = await api.post_draft(post.get_draft());
	await api.prepublish_draft(draft.id);
	await api.publish_draft(draft.id);
}

main().catch(console.error);
```

### Loading Posts from YAML Files

Use the provided example script:

```bash
# Default: draft.yaml in current folder
npm run example:yaml

# Choose file
npm run example:yaml -- -p examples/draft.yaml

# Optional cookies file override
npm run example:yaml -- -p examples/draft.yaml --cookies ./cookies.json
```

The script:

1. Loads `.env`
2. Parses YAML with nested body/tags support
3. Authenticates via cookies or email/password
4. Builds `Post(...)` with audience/write-comment settings
5. Uploads `captionedImage` items via `api.get_image(...)`
6. Creates draft using `post.get_draft()`
7. Applies slug/SEO metadata with `api.put_draft(...)`
8. Adds tags with `api.add_tags_to_post(...)`

Example YAML structure:

```yaml
title: "My Post Title"
subtitle: "My Post Subtitle"
audience: "everyone"  # everyone, only_paid, founding, only_free
write_comment_permissions: "everyone"  # none, only_paid, everyone
section: "my-section"
tags:
	- "typescript"
	- "substack"
body:
	0:
		type: "heading"
		level: 1
		content: "Introduction"
	1:
		type: "paragraph"
		content: "This is a paragraph."
	2:
		type: "captionedImage"
		src: "local_image.jpg"
```

### Publishing from Markdown

Use the markdown example script:

```bash
# Default: README.md
npm run example:markdown

# Custom markdown file
npm run example:markdown -- -m my-post.md

# Publish instead of draft only
npm run example:markdown -- -m my-post.md --publish

# Optional cookies file override
npm run example:markdown -- -m my-post.md --cookies ./cookies.json
```

The markdown example:

1. Loads `.env`
2. Resolves file path from cwd, then project root fallback
3. Extracts title from first `# ` heading
4. Parses markdown with `post.from_markdown(...)`
5. Creates a draft using `post.get_draft()`
6. Optionally publishes with `--publish`

### Subscriber Count Example

```bash
npm run example:subscriber-count
```

## Exports

- `Api` - Main Substack API client
- `Post` - Post builder compatible with python-substack flow
- `parseInline` / `parse_inline` - Markdown inline formatter parser
- `SubstackAPIException` - API-level exceptions
- `SubstackRequestException` - Request exceptions
- `SectionNotExistsException` - Missing section exception

## Development

Requires Node 18+.

```bash
npm run build
npm test
```

## Cookie Help

To get a cookie string:

1. Sign in to Substack
2. Open dev tools (`F12`) and go to Network
3. Refresh and pick a request (for example a subscriptions request)
4. Copy as fetch (Node.js)
5. Extract the `cookie` header value
6. Put it in `.env` as `COOKIES_STRING`
