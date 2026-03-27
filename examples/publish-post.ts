"use strict";

import fs from "fs";
import path from "path";
import { Api, Post } from "../src";

interface PostDefinition {
  title?: string;
  subtitle?: string;
  body?: string;
  markdown_file?: string;
  byline?: string;
  image?: string;
  publish?: boolean;
}

// Basic YAML parser for post definitions
function parseYaml(content: string): PostDefinition {
  const result: PostDefinition = {};
  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim();

    if (!key || !value) {
      continue;
    }

    const cleanKey = key.trim();
    const cleanValue = value.replace(/^["']|["']$/g, "");

    if (cleanKey === "title") {
      result.title = cleanValue;
    } else if (cleanKey === "subtitle") {
      result.subtitle = cleanValue;
    } else if (cleanKey === "body") {
      result.body = cleanValue;
    } else if (cleanKey === "markdown_file") {
      result.markdown_file = cleanValue;
    } else if (cleanKey === "byline") {
      result.byline = cleanValue;
    } else if (cleanKey === "image") {
      result.image = cleanValue;
    } else if (cleanKey === "publish") {
      result.publish = cleanValue.toLowerCase() === "true";
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let postFile: string | null = null;
  let publish = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-p" || args[i] === "--post") {
      postFile = args[i + 1];
      i++;
    } else if (args[i] === "--publish") {
      publish = true;
    }
  }

  if (!postFile) {
    console.error("Usage: npm run example:yaml -- -p <post_file.yaml> [--publish]");
    process.exit(1);
  }

  const sourceFile = path.resolve(process.cwd(), postFile);

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

    const postYaml = fs.readFileSync(sourceFile, "utf8");
    const postDef = parseYaml(postYaml);

    const post = new Post();

    if (postDef.title) {
      post.setTitle(postDef.title);
    }

    if (postDef.subtitle) {
      post.setSubtitle(postDef.subtitle);
    }

    if (postDef.byline) {
      post.setByline(postDef.byline);
    }

    if (postDef.image) {
      const imagePath = path.resolve(path.dirname(sourceFile), postDef.image);
      if (fs.existsSync(imagePath)) {
        const uploadedImage = await api.get_image(imagePath);
        post.setImage(uploadedImage.image_url);
        console.log(`Image uploaded: ${uploadedImage.image_url}`);
      } else {
        console.warn(`Image not found: ${imagePath}`);
        post.setImage(postDef.image);
      }
    }

    if (postDef.markdown_file) {
      const mdPath = path.resolve(path.dirname(sourceFile), postDef.markdown_file);
      if (fs.existsSync(mdPath)) {
        const markdownContent = fs.readFileSync(mdPath, "utf8");
        await post.fromMarkdown(markdownContent, api);
      } else {
        console.error(`Markdown file not found: ${mdPath}`);
        process.exit(1);
      }
    } else if (postDef.body) {
      post.paragraph(postDef.body);
    }

    console.log(`Title: ${post.title}`);
    console.log(`Content blocks: ${post.content.length}`);

    if (publish || postDef.publish) {
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
