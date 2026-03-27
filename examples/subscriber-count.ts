"use strict";

import "dotenv/config";
import { Api } from "../src";

async function main(): Promise<void> {
  const email = process.env.EMAIL || process.env.SUBSTACK_EMAIL;
  const password = process.env.PASSWORD || process.env.SUBSTACK_PASSWORD;
  const cookies_path = process.env.COOKIES_PATH || null;
  const cookies_string = process.env.COOKIES_STRING || null;
  const publication_url = process.env.PUBLICATION_URL || process.env.SUBSTACK_PUBLICATION_URL || null;

  if (!cookies_path && !cookies_string && (!email || !password)) {
    console.error(
      "Missing credentials. Set EMAIL and PASSWORD, or COOKIES_PATH, or COOKIES_STRING. PUBLICATION_URL is optional."
    );
    process.exit(1);
  }

  try {
    const api = new Api({ email, password, cookies_path, cookies_string, publication_url });
    await api.ready;

    const subscriberCount = await api.get_publication_subscriber_count();
    console.log(`Subscriber count: ${subscriberCount}`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();