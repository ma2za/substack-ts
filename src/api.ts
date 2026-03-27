"use strict";

import fs from "fs";
import path from "path";
import { URL } from "url";
import {
  SubstackAPIException,
  SubstackRequestException
} from "./exceptions";

function joinUrl(base: string, suffix: string): string {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(suffix, normalizedBase).toString().replace(/\/$/, "");
}

interface ApiOptions {
  email?: string | null;
  password?: string | null;
  cookies_path?: string | null;
  base_url?: string | null;
  publication_url?: string | null;
  debug?: boolean;
  cookies_string?: string | null;
}

interface Publication {
  id: number;
  subdomain: string;
  custom_domain?: string;
  custom_domain_optional?: boolean;
  publication_url: string;
  [key: string]: any;
}

interface UserProfile {
  id: number;
  primaryPublication?: Publication;
  publicationUsers?: Array<{
    publication: Publication;
    is_primary?: boolean;
  }>;
  [key: string]: any;
}

interface DraftData {
  id: number;
  [key: string]: any;
}

interface RequestOptions {
  params?: Record<string, any> | null;
  json?: Record<string, any> | null;
  data?: Record<string, any> | null;
}

export class Api {
  base_url: string;
  publication_url: string | null;
  ready: Promise<void>;
  private _cookies: Record<string, string>;
  private _defaultHeaders: Record<string, string>;

  constructor(options: ApiOptions = {}) {
    const {
      email = null,
      password = null,
      cookies_path = null,
      base_url = null,
      publication_url = null,
      debug = false,
      cookies_string = null
    } = options;

    this.base_url = base_url || "https://substack.com/api/v1";
    this.publication_url = null;
    this._cookies = {};
    this._defaultHeaders = {
      "accept": "application/json, text/plain, */*",
      "content-type": "application/json"
    };

    if (debug) {
      process.env.NODE_DEBUG = (process.env.NODE_DEBUG || "") + ",substack-js";
    }

    if (cookies_path !== null) {
      const cookiesRaw = fs.readFileSync(path.resolve(cookies_path), "utf8");
      const cookies = JSON.parse(cookiesRaw);
      this._cookies = { ...cookies };
    } else if (cookies_string !== null) {
      this._cookies = Api._parse_cookies_string(cookies_string);
    } else if (!(email !== null && password !== null)) {
      throw new Error(
        "Must provide email and password, cookies_path, or cookies_string to authenticate."
      );
    }

    this.ready = this._initialize({ email, password, publication_url });
  }

  private async _initialize({
    email,
    password,
    publication_url
  }: {
    email?: string | null;
    password?: string | null;
    publication_url?: string | null;
  }): Promise<void> {
    if (email !== null && email !== undefined && password !== null && password !== undefined) {
      await this.login(email, password);
    }

    let userPublication: Publication | null = null;
    if (publication_url) {
      const match = publication_url.toLowerCase().match(/https:\/\/(.*)\.substack\.com/);
      const subdomain = match ? match[1] : null;

      const userPublications = await this.get_user_publications();
      for (const publication of userPublications) {
        if (publication.subdomain === subdomain) {
          userPublication = publication;
          break;
        }
      }
    } else {
      userPublication = await this.get_user_primary_publication();
    }

    await this.change_publication(userPublication as Publication);
  }

  static _handle_response({ statusCode, text }: { statusCode: number; text: string }): any {
    if (!(statusCode >= 200 && statusCode < 300)) {
      throw new SubstackAPIException(statusCode, text);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new SubstackRequestException(`Invalid Response: ${text}`);
    }
  }

  private _cookieHeader(): string {
    const entries = Object.entries(this._cookies);
    if (entries.length === 0) {
      return "";
    }
    return entries.map(([key, value]) => `${key}=${value}`).join("; ");
  }

  private _updateCookiesFromResponse(response: Response): void {
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) {
      return;
    }

    const cookieParts = setCookie.split(",");
    for (const cookiePart of cookieParts) {
      const first = cookiePart.split(";")[0].trim();
      if (!first || !first.includes("=")) {
        continue;
      }
      const [name, ...valueParts] = first.split("=");
      this._cookies[name] = valueParts.join("=");
    }
  }

  private async _request(
    method: string,
    url: string,
    { params = null, json = null, data = null }: RequestOptions = {}
  ): Promise<any> {
    const requestUrl = new URL(url);
    if (params && typeof params === "object") {
      for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
          requestUrl.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = { ...this._defaultHeaders };
    const cookieHeader = this._cookieHeader();
    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }

    let body: string | undefined;
    if (json !== null && json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(json);
    } else if (data !== null && data !== undefined) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(data).toString();
    } else {
      delete headers["content-type"];
    }

    const response = await fetch(requestUrl.toString(), {
      method,
      headers,
      body
    });

    this._updateCookiesFromResponse(response);

    const text = await response.text();
    return Api._handle_response({ statusCode: response.status, text });
  }

  async login(email: string, password: string): Promise<any> {
    return this._request("POST", `${this.base_url}/login`, {
      json: {
        captcha_response: null,
        email,
        for_pub: "",
        password,
        redirect: "/"
      }
    });
  }

  static _parse_cookies_string(cookies_string: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const cookiePairRaw of cookies_string.split(";")) {
      const cookiePair = cookiePairRaw.trim();
      if (!cookiePair) {
        continue;
      }
      if (cookiePair.includes("=")) {
        const [key, ...valueParts] = cookiePair.split("=");
        const value = decodeURIComponent(valueParts.join("=").trim());
        cookies[key.trim()] = value;
      }
    }
    return cookies;
  }

  async signin_for_pub(publication: Publication): Promise<any> {
    try {
      return await this._request(
        "GET",
        `https://substack.com/sign-in?redirect=%2F&for_pub=${publication.subdomain}`
      );
    } catch (ex) {
      if (ex instanceof SubstackRequestException) {
        return {};
      }
      throw ex;
    }
  }

  async change_publication(publication: Publication): Promise<void> {
    this.publication_url = joinUrl(publication.publication_url, "api/v1");
    await this.signin_for_pub(publication);
  }

  export_cookies(filePath: string = "cookies.json"): void {
    fs.writeFileSync(path.resolve(filePath), JSON.stringify(this._cookies, null, 2));
  }

  async get_user_id(): Promise<number> {
    const profile = await this.get_user_profile();
    return profile.id;
  }

  static get_publication_url(publication: Publication): string {
    const customDomain = publication.custom_domain || null;
    if (!customDomain && !publication.custom_domain_optional) {
      return `https://${publication.subdomain}.substack.com`;
    }
    return `https://${customDomain}`;
  }

  async get_user_primary_publication(): Promise<Publication> {
    const profile = await this.get_user_profile();
    let primaryPublication: Publication | null = null;

    if (profile.primaryPublication) {
      primaryPublication = profile.primaryPublication;
    } else {
      const publicationUsers = profile.publicationUsers;
      if (Array.isArray(publicationUsers) && publicationUsers.length > 0) {
        for (const pubUser of publicationUsers) {
          if (pubUser && pubUser.is_primary) {
            primaryPublication = pubUser.publication;
            if (primaryPublication) {
              break;
            }
          }
        }

        if (primaryPublication === null) {
          primaryPublication = publicationUsers[0].publication;
        }
      }
    }

    if (primaryPublication === null) {
      throw new SubstackRequestException("Could not find primary publication in profile");
    }

    primaryPublication.publication_url = Api.get_publication_url(primaryPublication);
    return primaryPublication;
  }

  async get_user_publications(): Promise<Publication[]> {
    const profile = await this.get_user_profile();
    const userPublications: Publication[] = [];
    const publicationUsers = profile.publicationUsers;

    if (!Array.isArray(publicationUsers)) {
      return userPublications;
    }

    for (const publication of publicationUsers) {
      const pub = publication.publication;
      if (pub) {
        pub.publication_url = Api.get_publication_url(pub);
        userPublications.push(pub);
      }
    }

    return userPublications;
  }

  async get_user_profile(): Promise<UserProfile> {
    return this._request("GET", `${this.base_url}/user/profile/self`);
  }

  async get_user_settings(): Promise<any> {
    return this._request("GET", `${this.base_url}/settings`);
  }

  async get_publication_users(): Promise<any> {
    return this._request("GET", `${this.publication_url}/publication/users`);
  }

  async get_publication_subscriber_count(): Promise<number> {
    const response = await this._request(
      "GET",
      `${this.publication_url}/publication_launch_checklist`
    );
    return response.subscriberCount;
  }

  async get_published_posts(
    offset: number = 0,
    limit: number = 25,
    order_by: string = "post_date",
    order_direction: string = "desc"
  ): Promise<any> {
    return this._request("GET", `${this.publication_url}/post_management/published`, {
      params: { offset, limit, order_by, order_direction }
    });
  }

  async get_posts(): Promise<any> {
    return this._request("GET", `${this.base_url}/reader/posts`);
  }

  async get_drafts(filter: string | null = null, offset: number | null = null, limit: number | null = null): Promise<any> {
    return this._request("GET", `${this.publication_url}/drafts`, {
      params: { filter, offset, limit }
    });
  }

  async get_draft(draft_id: number | string): Promise<DraftData> {
    return this._request("GET", `${this.publication_url}/drafts/${draft_id}`);
  }

  async delete_draft(draft_id: number | string): Promise<any> {
    return this._request("DELETE", `${this.publication_url}/drafts/${draft_id}`);
  }

  async post_draft(body: Record<string, any>): Promise<DraftData> {
    return this._request("POST", `${this.publication_url}/drafts`, { json: body });
  }

  async put_draft(draft: number | string, kwargs: Record<string, any> = {}): Promise<any> {
    return this._request("PUT", `${this.publication_url}/drafts/${draft}`, { json: kwargs });
  }

  async prepublish_draft(draft: number | string): Promise<any> {
    return this._request("GET", `${this.publication_url}/drafts/${draft}/prepublish`);
  }

  async publish_draft(
    draft: number | string,
    send: boolean = true,
    share_automatically: boolean = false
  ): Promise<any> {
    return this._request("POST", `${this.publication_url}/drafts/${draft}/publish`, {
      json: { send, share_automatically }
    });
  }

  async schedule_draft(draft: number | string, draft_datetime: Date | string): Promise<any> {
    const postDate = draft_datetime instanceof Date ? draft_datetime.toISOString() : draft_datetime;
    return this._request("POST", `${this.publication_url}/drafts/${draft}/schedule`, {
      json: { post_date: postDate }
    });
  }

  async unschedule_draft(draft: number | string): Promise<any> {
    return this._request("POST", `${this.publication_url}/drafts/${draft}/schedule`, {
      json: { post_date: null }
    });
  }

  async get_image(image: string): Promise<any> {
    let imageData = image;
    if (fs.existsSync(image)) {
      const file = fs.readFileSync(image);
      imageData = `data:image/jpeg;base64,${file.toString("base64")}`;
    }

    return this._request("POST", `${this.publication_url}/image`, {
      data: { image: imageData }
    });
  }

  async add_tags_to_post(post_id: number | string, tag_names: string[]): Promise<any> {
    const results = [];
    for (const tagName of tag_names) {
      const result = await this.add_tag_to_post(post_id, tagName);
      results.push(result);
    }
    return { tags_added: results };
  }

  async get_publication_post_tags(): Promise<any[]> {
    return this._request("GET", `${this.publication_url}/publication/post-tag`);
  }

  async add_tag_to_post(post_id: number | string, tag_name: string): Promise<any> {
    const existingTags = (await this.get_publication_post_tags()) || [];
    const existingTag = existingTags.find((tag: any) => tag.name === tag_name) || null;

    let tagId: number;
    if (existingTag !== null) {
      tagId = existingTag.id;
    } else {
      const tagData = await this._request("POST", `${this.publication_url}/publication/post-tag`, {
        json: { name: tag_name }
      });
      tagId = tagData.id;
    }

    return this._request("POST", `${this.publication_url}/post/${post_id}/tag/${tagId}`);
  }

  async get_categories(): Promise<any> {
    return this._request("GET", `${this.base_url}/categories`);
  }

  async get_category(category_id: string | number, category_type: string, page: number): Promise<any> {
    return this._request("GET", `${this.base_url}/category/public/${category_id}/${category_type}`, {
      params: { page }
    });
  }

  async get_single_category(
    category_id: string | number,
    category_type: string,
    page: number | null = null,
    limit: number | null = null
  ): Promise<any> {
    if (page !== null) {
      return this.get_category(category_id, category_type, page);
    }

    const publications: any[] = [];
    let pageNumber = 0;
    let pageOutput: any = { more: false };

    while (true) {
      pageOutput = await this.get_category(category_id, category_type, pageNumber);
      publications.push(...(pageOutput.publications || []));
      if ((limit !== null && limit <= publications.length) || !pageOutput.more) {
        break;
      }
      pageNumber += 1;
    }

    return {
      publications: limit !== null ? publications.slice(0, limit) : publications,
      more: Boolean(pageOutput.more)
    };
  }

  async delete_all_drafts(): Promise<any> {
    let response: any = null;
    while (true) {
      const drafts = await this.get_drafts("draft", 0, 10);
      if (!Array.isArray(drafts) || drafts.length === 0) {
        break;
      }
      for (const draft of drafts) {
        response = await this.delete_draft(draft.id);
      }
    }
    return response;
  }

  async get_sections(): Promise<any> {
    const content = await this._request("GET", `${this.publication_url}/subscriptions`);
    const sections = (content.publications || [])
      .filter((publication: any) => this.publication_url!.includes(publication.hostname))
      .map((publication: any) => publication.sections);

    return sections[0];
  }

  async publication_embed(url: string): Promise<any> {
    return this.call("/publication/embed", "GET", { url });
  }

  async call(endpoint: string, method: string, params: Record<string, any> = {}): Promise<any> {
    return this._request(method, `${this.publication_url}/${endpoint}`, { params });
  }
}
