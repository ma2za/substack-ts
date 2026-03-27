"use strict";

import fs from "fs";
import path from "path";
import { Api, Post } from "../src";

interface Arguments {
  m?: string;
  markdown?: string;
  p?: boolean;
  publish?: boolean;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed: Arguments = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-m" || args[i] === "--markdown") {
      parsed.markdown = args[i + 1];
      i++;
    } else if (args[i] === "-p" || args[i] === "--publish") {
      parsed.publish = true;
    }
  }

  if (!parsed.markdown) {
    console.error("Usage: npm run example:markdown -- -m <markdown_file> [--publish]");
    process.exit(1);
  }

  const sourceFile = path.resolve(process.cwd(), parsed.markdown);

  if (!fs.existsSync(sourceFile)) {
    console.error(`File not found: ${sourceFile}`);
    process.exit(1);
  }

  const email = process.env.SUBSTACK_EMAIL || process.env.SUBSTACK_USER;
  const password = process.env.SUBSTACK_PASSWORD;

  if (!email || !password) {
    console.error(
      "Missing SUBSTACK_EMAIL (or SUBSTACK_USER) and SUBSTACK_PASSWORD environment variables"
    );
    process.exit(1);
  }

  try {
    const api = new Api({ email, password });
    await api.ready;

    const markdownContent = fs.readFileSync(sourceFile, "utf8");
    const post = new Post();
    await post.fromMarkdown(markdownContent, api);

    console.log(`Title: ${post.title}`);
    console.log(`Content blocks: ${post.content.length}`);

    if (parsed.publish) {
      const draft = await api.post_draft(post.toDraft());
      console.log(`Draft created with ID: ${draft.id}`);
      const published = await api.publish_draft(draft.id);
      console.log("Post published!");
      console.log(JSON.stringify(published, null, 2));
    } else {
      console.log("Draft object (not published):");
      console.log(JSON.stringify(post.toDraft(), null, 2));
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
