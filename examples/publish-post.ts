"use strict";

import "dotenv/config";
import fs from "fs";
import path from "path";
import YAML from "yaml";
import { Api, Post } from "../src";

interface PostDefinition {
  title?: string;
  subtitle?: string;
  audience?: string;
  write_comment_permissions?: string;
  section?: string;
  body?: Record<string, any>;
  search_engine_title?: string;
  search_engine_description?: string;
  slug?: string;
  tags?: string[];
  publish?: boolean;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let postFile: string = "draft.yaml";
  let publish = false;
  let cookiesArg: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-p" || args[i] === "--post") {
      postFile = args[i + 1] || postFile;
      i++;
    } else if (args[i] === "--publish") {
      // Mirrors the current Python script where --publish uses action="store_false".
      publish = false;
    } else if (args[i] === "--cookies") {
      cookiesArg = args[i + 1] || null;
      i++;
    }
  }

  const sourceFile = path.resolve(process.cwd(), postFile);

  if (!fs.existsSync(sourceFile)) {
    console.error(`File not found: ${sourceFile}`);
    process.exit(1);
  }

  const email = process.env.EMAIL || process.env.SUBSTACK_EMAIL || process.env.SUBSTACK_USER;
  const password = process.env.PASSWORD || process.env.SUBSTACK_PASSWORD;
  const cookies_path = cookiesArg || process.env.COOKIES_PATH || null;
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

    const postYaml = fs.readFileSync(sourceFile, "utf8");
    const postDoc = YAML.parseDocument(postYaml, { uniqueKeys: false });
    const postDef = (postDoc.toJS() || {}) as PostDefinition;

    const userId = await api.get_user_id();

    const post = new Post(
      postDef.title || "",
      postDef.subtitle || "",
      userId,
      postDef.audience || "everyone",
      postDef.write_comment_permissions || "everyone"
    );

    const bodyNode: any = postDoc.get("body", true);
    const orderedBodyEntries: Array<[string, any]> =
      bodyNode && Array.isArray(bodyNode.items)
        ? bodyNode.items.map((pair: any) => [
            String(pair?.key?.value ?? pair?.key ?? ""),
            pair?.value?.toJSON ? pair.value.toJSON() : pair?.value
          ])
        : Object.entries(postDef.body || {});

    for (const [, rawItem] of orderedBodyEntries) {
      const item = { ...(rawItem as Record<string, any>) };
      if (item.type === "captionedImage") {
        const image = await api.get_image(item.src);
        item.src = image.url || image.image_url || item.src;
      }
      post.add(item);
    }

    console.log(`Title: ${post.draft_title}`);
    console.log(`Content blocks: ${post.draft_body.content.length}`);

    const draft = await api.post_draft(post.get_draft());

    const putDraftKwargs: Record<string, any> = {
      draft_section_id: post.draft_section_id,
      search_engine_title: postDef.search_engine_title,
      search_engine_description: postDef.search_engine_description,
      slug: postDef.slug
    };

    const filteredPutDraftKwargs = Object.fromEntries(
      Object.entries(putDraftKwargs).filter(([, value]) => value !== null && value !== undefined)
    );

    await api.put_draft(draft.id, filteredPutDraftKwargs);
    await api.add_tags_to_post(draft.id, postDef.tags || []);

    if (publish) {
      await api.prepublish_draft(draft.id);
      const published = await api.publish_draft(draft.id);
      console.log("Post published!");
      console.log(JSON.stringify(published, null, 2));
    } else {
      console.log(`Draft created with ID: ${draft.id}`);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
