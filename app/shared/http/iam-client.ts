const DEFAULT_IAM_BASE_URL = "https://txiam.techsuitesystems.com/api";

export class IamApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "IamApiError";
  }
}

export function iamBaseUrl() {
  return (process.env.IAM_API_BASE_URL ?? DEFAULT_IAM_BASE_URL).replace(/\/$/, "");
}

export async function iamPostJson(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const url = `${iamBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new IamApiError("Unable to reach the sign-in service.", 502);
  }

  const text = await response.text();
  return { status: response.status, data: parseJsonBody(text) };
}

function parseJsonBody(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 240) };
  }
}
