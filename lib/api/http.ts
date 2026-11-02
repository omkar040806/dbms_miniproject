// Shared plumbing for API route handlers: consistent JSON errors, body parsing
// with Zod, and turning PostgreSQL constraint violations into readable messages.
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { constraintMessage } from "./db-errors";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

type Handler<C> = (request: NextRequest, context: C) => Promise<Response>;

/** Wrap a route handler so every error becomes a JSON response with the right status code. */
export function apiHandler<C = RouteContext>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(request: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
}

/** Parse a numeric route parameter such as /api/papers/[id]. */
export function parseId(value: string, name = "id"): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${name}`);
  return id;
}

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
}

function isPgError(error: unknown): error is PgError {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as PgError).code === "string";
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return json({ error: error.message, details: error.details }, error.status);
  }
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }));
    const first = issues[0];
    return json({ error: first ? `${first.field ? `${first.field}: ` : ""}${first.message}` : "Invalid input", details: issues }, 400);
  }
  if (isPgError(error)) {
    // Constraint violations come from the database itself: the last line of input validation.
    const friendly = error.constraint ? constraintMessage(error.constraint) : undefined;
    switch (error.code) {
      case "23505": // unique_violation
        return json({ error: friendly ?? "This record already exists", details: { constraint: error.constraint } }, 409);
      case "23503": // foreign_key_violation
        return json({ error: friendly ?? "A referenced record does not exist", details: { constraint: error.constraint } }, 409);
      case "23514": // check_violation (also raised by our procedures)
      case "23502": // not_null_violation
      case "22023": // invalid_parameter_value (raised by our functions)
      case "22P02": // invalid_text_representation
      case "22001": // string_data_right_truncation
        return json({ error: friendly ?? error.message ?? "Invalid data", details: { constraint: error.constraint } }, 400);
      case "P0001": // RAISE EXCEPTION without a code
        return json({ error: error.message ?? "Rejected by the database" }, 400);
      default:
        break;
    }
  }
  console.error(error);
  return json({ error: "Something went wrong on the server" }, 500);
}
