"use strict";

import { Api } from "../src";

async function main(): Promise<void> {
  const email = process.env.SUBSTACK_EMAIL || process.env.EMAIL;
  const password = process.env.SUBSTACK_PASSWORD || process.env.PASSWORD;
  const publication_url = process.env.SUBSTACK_PUBLICATION_URL || process.env.PUBLICATION_URL;

  if (!email || !password || !publication_url) {
    console.error(
      "Missing env vars: SUBSTACK_EMAIL (or EMAIL), SUBSTACK_PASSWORD (or PASSWORD), and SUBSTACK_PUBLICATION_URL (or PUBLICATION_URL)"
    );
    process.exit(1);
  }

  try {
    const api = new Api({ email, password, publication_url });
    await api.ready;

    const subscriberCount = await api.get_publication_subscriber_count();
    console.log(`Subscriber count: ${subscriberCount}`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();