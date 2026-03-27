"use strict";

import "dotenv/config";
import fs from "fs";
import path from "path";
import { Api, Post } from "../src";

interface Arguments {
  m?: string;
  markdown?: string;
  cookies?: string;
  p?: boolean;
  publish?: boolean;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed: Arguments = { markdown: "README.md", publish: false, cookies: undefined };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-m" || args[i] === "--markdown") {
      parsed.markdown = args[i + 1] || parsed.markdown;
      i++;
    } else if (args[i] === "-p" || args[i] === "--publish") {
      parsed.publish = true;
    } else if (args[i] === "--cookies") {
      parsed.cookies = args[i + 1] || undefined;
      i++;
    }
  }

  const email = process.env.EMAIL || process.env.SUBSTACK_EMAIL || process.env.SUBSTACK_USER;
  const password = process.env.PASSWORD || process.env.SUBSTACK_PASSWORD;
  const cookies_path = parsed.cookies || process.env.COOKIES_PATH || null;
  const cookies_string = process.env.COOKIES_STRING || null;
  const publication_url = process.env.PUBLICATION_URL || process.env.SUBSTACK_PUBLICATION_URL || null;

  if (!cookies_path && !cookies_string && (!email || !password)) {
    console.error(
      "Missing credentials. Set EMAIL and PASSWORD, or COOKIES_PATH, or COOKIES_STRING. PUBLICATION_URL is optional."
    );
    process.exit(1);
  }

  try {
    const api = new Api({
      email: cookies_path || cookies_string ? null : email,
      password: cookies_path || cookies_string ? null : password,
      cookies_path,
      cookies_string,
      publication_url
    });
    await api.ready;

    const userId = await api.get_user_id();

    const markdownArg = parsed.markdown || "README.md";
    let markdownPath = path.resolve(process.cwd(), markdownArg);
    if (!fs.existsSync(markdownPath)) {
      markdownPath = path.resolve(__dirname, "..", markdownArg);
    }

    if (!fs.existsSync(markdownPath)) {
      console.error(`Error: Markdown file not found at ${markdownPath}`);
      process.exit(1);
    }

    const markdownContent = fs.readFileSync(markdownPath, "utf8");

    let title = "Python Substack";
    const subtitle = "Markdown Test Post";
    const lines = markdownContent.split("\n");
    for (const line of lines) {
      if (line.startsWith("# ")) {
        title = line.slice(2).trim();
        break;
      }
      if (line.startsWith("#")) {
        continue;
      }
    }

    const post = new Post(title, subtitle, userId);

    console.log(`Parsing Markdown from ${markdownPath}...`);
    await post.from_markdown(markdownContent, api);

    console.log("Creating draft...");
    const draft = await api.post_draft(post.get_draft());

    if (parsed.publish) {
      console.log("Preparing to publish...");
      await api.prepublish_draft(draft.id);
      console.log("Publishing...");
      await api.publish_draft(draft.id);
      console.log("Post published successfully!");
    } else {
      console.log(`Draft created with ID: ${draft.id}`);
      console.log(`Title: ${title}`);
      console.log(`Subtitle: ${subtitle}`);
      console.log("Use --publish flag to publish the draft.");
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
