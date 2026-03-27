"use strict";

import { SectionNotExistsException } from "./exceptions";
import { Api } from "./api";

interface InlineToken {
  content: string;
  marks?: Mark[];
}

interface MarkdownMatch {
  start: number;
  end: number;
  type: string;
  content: string;
  url?: string | null;
}

interface Mark {
  type: string;
  attrs?: Record<string, any>;
}

interface ContentItem {
  type: string;
  content?: any[];
  text?: string;
  attrs?: Record<string, any>;
  [key: string]: any;
}

interface DraftBody {
  type: string;
  content: ContentItem[];
}

interface DraftByline {
  id: number;
  is_guest: boolean;
}

export function parseInline(text: string): InlineToken[] {
  if (!text) {
    return [];
  }

  const tokens: InlineToken[] = [];

  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const boldPattern = /\*\*([^*]+)\*\*/g;
  const italicPattern = /(?<!\*)\*([^*]+)\*(?!\*)/g;

  const matches: MarkdownMatch[] = [];

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text)) !== null) {
    const isImageLink =
      match.index !== 0 && text.slice(match.index - 1, match.index + 1) === "![";
    if (!isImageLink) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "link",
        content: match[1],
        url: match[2]
      });
    }
  }

  while ((match = boldPattern.exec(text)) !== null) {
    const overlaps = matches.some((m) => m.start <= match!.index && match!.index < m.end);
    if (!overlaps) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "bold",
        content: match[1],
        url: null
      });
    }
  }

  while ((match = italicPattern.exec(text)) !== null) {
    const overlaps = matches.some((m) => m.start <= match!.index && match!.index < m.end);
    if (!overlaps) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "italic",
        content: match[1],
        url: null
      });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  let lastPos = 0;
  for (const current of matches) {
    if (current.start > lastPos) {
      tokens.push({ content: text.slice(lastPos, current.start) });
    }

    if (current.type === "link") {
      tokens.push({
        content: current.content,
        marks: [{ type: "link", attrs: { href: current.url } }]
      });
    } else if (current.type === "bold") {
      tokens.push({ content: current.content, marks: [{ type: "strong" }] });
    } else if (current.type === "italic") {
      tokens.push({ content: current.content, marks: [{ type: "em" }] });
    }

    lastPos = current.end;
  }

  if (lastPos < text.length) {
    tokens.push({ content: text.slice(lastPos) });
  }

  return tokens.filter((token) => Boolean(token.content));
}

export class Post {
  draft_title: string;
  draft_subtitle: string;
  draft_body: DraftBody;
  draft_bylines: DraftByline[];
  audience: string;
  draft_section_id: number | null;
  section_chosen: boolean;
  write_comment_permissions: string;

  constructor(
    title: string = "",
    subtitle: string = "",
    user_id: number | string | null = null,
    audience: string | null = null,
    write_comment_permissions: string | null = null
  ) {
    this.draft_title = title;
    this.draft_subtitle = subtitle;
    this.draft_body = { type: "doc", content: [] };
    this.draft_bylines = user_id !== null ? [{ id: Number(user_id), is_guest: false }] : [];
    this.audience = audience !== null ? audience : "everyone";
    this.draft_section_id = null;
    this.section_chosen = true;
    this.write_comment_permissions =
      write_comment_permissions !== null ? write_comment_permissions : this.audience;
  }

  set_section(name: string, sections: Array<Record<string, any>>): void {
    const section = sections.filter((s) => s.name === name);
    if (section.length !== 1) {
      throw new SectionNotExistsException(name);
    }
    this.draft_section_id = section[0].id;
  }

  add(item: Record<string, any>): this {
    this.draft_body.content = this.draft_body.content.concat([{ type: item.type } as ContentItem]);
    const content = item.content;

    if (item.type === "captionedImage") {
      this.captioned_image(item.src, item.fullscreen, item.imageSize, item.height, item.width, item.resizeWidth, item.bytes, item.alt, item.title, item.type, item.href, item.belowTheFold, item.internalRedirect);
    } else if (item.type === "embeddedPublication") {
      this.draft_body.content[this.draft_body.content.length - 1].attrs = item.url;
    } else if (item.type === "youtube2") {
      this.youtube(item.src);
    } else if (item.type === "subscribeWidget") {
      this.subscribe_with_caption(item.message);
    } else if (item.type === "codeBlock") {
      this.code_block(item.content, item.attrs || {});
    } else if (content !== null && content !== undefined) {
      this.add_complex_text(content);
    }

    if (item.type === "heading") {
      this.attrs(item.level || 1);
    }

    if (item.marks !== null && item.marks !== undefined) {
      this.marks(item.marks);
    }

    return this;
  }

  paragraph(content: string | InlineToken[] | null = null): this {
    const item: Record<string, any> = { type: "paragraph" };
    if (content !== null) {
      item.content = content;
    }
    return this.add(item);
  }

  heading(content: string | InlineToken[] | null = null, level: number = 1): this {
    const item: Record<string, any> = { type: "heading", level };
    if (content !== null) {
      item.content = content;
    }
    return this.add(item);
  }

  blockquote(content: string | Array<Record<string, any>> | null = null): this {
    const paragraphs: Array<Record<string, any>> = [];

    if (content !== null) {
      if (typeof content === "string") {
        const tokens = parseInline(content);
        const textNodes = tokens.map((token) => ({ type: "text", text: token.content }));
        if (textNodes.length > 0) {
          paragraphs.push({ type: "paragraph", content: textNodes });
        }
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (item && item.type === "paragraph") {
            paragraphs.push(item);
          } else if (item) {
            paragraphs.push({
              type: "paragraph",
              content: [{ type: "text", text: item.content || "" }]
            });
          }
        }
      }
    }

    const node: Record<string, any> = { type: "blockquote" };
    if (paragraphs.length > 0) {
      node.content = paragraphs;
    }

    this.draft_body.content = this.draft_body.content.concat([node as ContentItem]);
    return this;
  }

  horizontal_rule(): this {
    return this.add({ type: "horizontal_rule" });
  }

  attrs(level: number): this {
    const last = this.draft_body.content[this.draft_body.content.length - 1] || { type: "paragraph" };
    const contentAttrs = last.attrs || {};
    contentAttrs.level = level;
    last.attrs = contentAttrs;
    this.draft_body.content[this.draft_body.content.length - 1] = last;
    return this;
  }

  captioned_image(
    src: string,
    fullscreen: boolean = false,
    imageSize: string = "normal",
    height: number = 819,
    width: number = 1456,
    resizeWidth: number = 728,
    bytes: string | null = null,
    alt: string | null = null,
    title: string | null = null,
    type: string | null = null,
    href: string | null = null,
    belowTheFold: boolean = false,
    internalRedirect: string | null = null
  ): this {
    const last = this.draft_body.content[this.draft_body.content.length - 1] || ({ type: "paragraph" } as ContentItem);
    const content = last.content || [];

    content.push({
      type: "image2",
      attrs: {
        src,
        fullscreen,
        imageSize,
        height,
        width,
        resizeWidth,
        bytes,
        alt,
        title,
        type,
        href,
        belowTheFold,
        internalRedirect
      }
    } as ContentItem);

    last.content = content;
    this.draft_body.content[this.draft_body.content.length - 1] = last;
    return this;
  }

  text(value: string): this {
    const last = this.draft_body.content[this.draft_body.content.length - 1] || ({ type: "paragraph" } as ContentItem);
    const content = last.content || [];
    content.push({ type: "text", text: value } as ContentItem);
    last.content = content;
    this.draft_body.content[this.draft_body.content.length - 1] = last;
    return this;
  }

  add_complex_text(text: string | InlineToken[]): void {
    if (typeof text === "string") {
      this.text(text);
      return;
    }

    for (const chunk of text) {
      if (chunk) {
        this.text(chunk.content || "").marks(chunk.marks || []);
      }
    }
  }

  marks(marks: Array<Record<string, any>>): this {
    const last = this.draft_body.content[this.draft_body.content.length - 1];
    const node = last && Array.isArray(last.content) ? last.content[last.content.length - 1] : null;
    if (!node) {
      return this;
    }

    const contentMarks = (node as any).marks || [];
    for (const mark of marks) {
      const newMark: Record<string, any> = { type: mark.type };
      if (mark.type === "link") {
        const href = mark.href || (mark.attrs && mark.attrs.href);
        newMark.attrs = { href };
      }
      contentMarks.push(newMark);
    }
    (node as any).marks = contentMarks;
    return this;
  }

  remove_last_paragraph(): void {
    this.draft_body.content.pop();
  }

  get_draft(): Record<string, any> {
    const out = {
      draft_title: this.draft_title,
      draft_subtitle: this.draft_subtitle,
      draft_body: this.draft_body,
      draft_bylines: this.draft_bylines,
      audience: this.audience,
      draft_section_id: this.draft_section_id,
      section_chosen: this.section_chosen,
      write_comment_permissions: this.write_comment_permissions
    };
    out.draft_body = JSON.stringify(out.draft_body) as any;
    return out;
  }

  subscribe_with_caption(message: string | null = null): this {
    const resolvedMessage =
      message ||
      "Thanks for reading this newsletter!\n            Subscribe for free to receive new posts and support my work.";

    const subscribe = this.draft_body.content[this.draft_body.content.length - 1] || ({ type: "subscribeWidget" } as ContentItem);
    subscribe.attrs = {
      url: "%%checkout_url%%",
      text: "Subscribe",
      language: "en"
    };
    subscribe.content = [
      {
        type: "ctaCaption",
        content: [
          {
            type: "text",
            text: resolvedMessage
          } as ContentItem
        ]
      } as ContentItem
    ];
    this.draft_body.content[this.draft_body.content.length - 1] = subscribe;
    return this;
  }

  youtube(value: string): this {
    const last = this.draft_body.content[this.draft_body.content.length - 1] || ({ type: "youtube2" } as ContentItem);
    const contentAttrs = last.attrs || {};
    contentAttrs.videoId = value;
    last.attrs = contentAttrs;
    this.draft_body.content[this.draft_body.content.length - 1] = last;
    return this;
  }

  code_block(content: string | Array<Record<string, any>>, attrs: Record<string, any> = {}): this {
    const codeContent = typeof content === "string" ? [{ type: "text", text: content }] : content || [];
    const last = this.draft_body.content[this.draft_body.content.length - 1] || ({ type: "codeBlock" } as ContentItem);
    last.content = codeContent as ContentItem[];
    if (attrs && Object.keys(attrs).length > 0) {
      last.attrs = attrs;
    }
    this.draft_body.content[this.draft_body.content.length - 1] = last;
    return this;
  }

  async from_markdown(markdown_content: string, api?: Api): Promise<this> {
    const lines = markdown_content.split("\n");
    const blocks: Array<Record<string, any>> = [];
    let currentBlock: string[] = [];
    let inCodeBlock = false;
    let codeBlockLanguage: string | null = null;

    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          if (currentBlock.length > 0) {
            blocks.push({ type: "code", language: codeBlockLanguage, content: currentBlock.join("\n") });
          }
          currentBlock = [];
          inCodeBlock = false;
          codeBlockLanguage = null;
        } else {
          if (currentBlock.length > 0) {
            blocks.push({ type: "text", content: currentBlock.join("\n") });
            currentBlock = [];
          }
          const language = line.trim().slice(3).trim();
          codeBlockLanguage = language || null;
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        currentBlock.push(line);
      } else if (line.trim() === "") {
        if (currentBlock.length > 0) {
          blocks.push({ type: "text", content: currentBlock.join("\n") });
          currentBlock = [];
        }
      } else {
        currentBlock.push(line);
      }
    }

    if (currentBlock.length > 0) {
      if (inCodeBlock) {
        blocks.push({ type: "code", language: codeBlockLanguage, content: currentBlock.join("\n") });
      } else {
        blocks.push({ type: "text", content: currentBlock.join("\n") });
      }
    }

    for (const block of blocks) {
      if (block.type === "code") {
        const codeContent = String(block.content || "").trim();
        if (codeContent) {
          const codeAttrs: Record<string, any> = {};
          if (block.language) {
            codeAttrs.language = block.language;
          }
          this.add({ type: "codeBlock", content: codeContent, attrs: codeAttrs });
        }
        continue;
      }

      const textContent = String(block.content || "").trim();
      if (!textContent) {
        continue;
      }

      if (textContent.startsWith("#")) {
        const level = textContent.length - textContent.replace(/^#+/, "").length;
        const headingText = textContent.replace(/^#+/, "").trim();
        if (headingText) {
          this.heading(headingText, Math.min(level, 6));
        }
      } else if (
        textContent.startsWith("!") ||
        (textContent.startsWith("[") && textContent.includes("!["))
      ) {
        const linkedImageMatch = textContent.match(/^\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/);
        if (linkedImageMatch) {
          const altText = linkedImageMatch[1];
          let imageUrl = linkedImageMatch[2];
          const linkUrl = linkedImageMatch[3];

          imageUrl = imageUrl.startsWith("/") ? imageUrl.slice(1) : imageUrl;

          if (api) {
            try {
              const image = await api.get_image(imageUrl);
              imageUrl = image.url || image.image_url || imageUrl;
            } catch {
              // Keep original URL when upload fails.
            }
          }

          this.add({ type: "captionedImage", src: imageUrl, alt: altText, href: linkUrl });
        } else {
          const imageMatch = textContent.match(/^!\[.*?\]\((.*?)\)/);
          if (imageMatch) {
            let imageUrl = imageMatch[1];
            imageUrl = imageUrl.startsWith("/") ? imageUrl.slice(1) : imageUrl;

            if (api) {
              try {
                const image = await api.get_image(imageUrl);
                imageUrl = image.url || image.image_url || imageUrl;
              } catch {
                // Keep original URL when upload fails.
              }
            }

            this.add({ type: "captionedImage", src: imageUrl });
          }
        }
      } else if (textContent.includes("\n")) {
        const pendingBullets: InlineToken[][] = [];
        const pendingQuotes: string[] = [];

        const flushBullets = () => {
          if (pendingBullets.length === 0) {
            return;
          }
          const listItems = pendingBullets.map((bulletNodes) => ({
            type: "list_item",
            content: [{ type: "paragraph", content: bulletNodes }]
          }));
          this.draft_body.content.push({ type: "bullet_list", content: listItems } as ContentItem);
          pendingBullets.length = 0;
        };

        const flushQuotes = () => {
          if (pendingQuotes.length === 0) {
            return;
          }
          const paragraphs: Array<Record<string, any>> = [];
          for (const quoteLine of pendingQuotes) {
            const tokens = parseInline(quoteLine);
            const textNodes = tokens.map((token) => ({ type: "text", text: token.content }));
            if (textNodes.length > 0) {
              paragraphs.push({ type: "paragraph", content: textNodes });
            }
          }
          const node: Record<string, any> = { type: "blockquote" };
          if (paragraphs.length > 0) {
            node.content = paragraphs;
          }
          this.draft_body.content.push(node as ContentItem);
          pendingQuotes.length = 0;
        };

        for (let line of textContent.split("\n")) {
          line = line.trim();
          if (!line) {
            flushBullets();
            flushQuotes();
            continue;
          }

          if (line.startsWith("> ") || line === ">") {
            flushBullets();
            const quoteText = line.startsWith("> ") ? line.slice(2) : "";
            pendingQuotes.push(quoteText);
            continue;
          }

          let bulletText: string | null = null;
          if (line.startsWith("* ")) {
            bulletText = line.slice(2).trim();
          } else if (line.startsWith("- ")) {
            bulletText = line.slice(2).trim();
          } else if (line.startsWith("*") && !line.startsWith("**")) {
            bulletText = line.slice(1).trim();
          }

          if (bulletText !== null) {
            flushQuotes();
            const tokens = parseInline(bulletText);
            if (tokens.length > 0) {
              pendingBullets.push(tokens);
            }
          } else {
            flushBullets();
            flushQuotes();
            this.add({ type: "paragraph", content: parseInline(line) });
          }
        }

        flushBullets();
        flushQuotes();
      } else if (textContent.startsWith("> ") || textContent === ">") {
        const quoteText = textContent.startsWith("> ") ? textContent.slice(2) : "";
        const tokens = parseInline(quoteText);
        const textNodes = tokens.map((token) => ({ type: "text", text: token.content }));
        const para = textNodes.length > 0 ? { type: "paragraph", content: textNodes } : { type: "paragraph" };
        this.draft_body.content = this.draft_body.content.concat([
          { type: "blockquote", content: [para] } as ContentItem
        ]);
      } else {
        this.add({ type: "paragraph", content: parseInline(textContent) });
      }
    }

    return this;
  }
}
