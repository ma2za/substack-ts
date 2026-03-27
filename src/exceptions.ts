"use strict";

export class SubstackAPIException extends Error {
  status_code: number;
  message: string;

  constructor(statusCode: number, text: string) {
    let message: string;
    try {
      const jsonRes = JSON.parse(text);
      const errors = Array.isArray(jsonRes.errors)
        ? jsonRes.errors.map((error: any) => (error && error.msg ? error.msg : ""))
        : [];
      message = errors.join(", ") || jsonRes.error || "";
    } catch {
      message = `Invalid JSON error message from Substack: ${text}`;
    }

    super(`APIError(code=${statusCode}): ${message}`);
    this.name = "SubstackAPIException";
    this.status_code = statusCode;
    this.message = message;
  }

  toString(): string {
    return `APIError(code=${this.status_code}): ${this.message}`;
  }
}

export class SubstackRequestException extends Error {
  message: string;

  constructor(message: string) {
    super(`SubstackRequestException: ${message}`);
    this.name = "SubstackRequestException";
    this.message = message;
  }

  toString(): string {
    return `SubstackRequestException: ${this.message}`;
  }
}

export class SectionNotExistsException extends SubstackRequestException {}
