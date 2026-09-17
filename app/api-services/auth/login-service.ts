import { decode } from "jsonwebtoken";

import { IamApiError, iamPostJson } from "@/app/shared/http/iam-client";

import type { AuthSessionUser, LoginCredentials, LoginSession } from "./login-types";

const LOGIN_PATH = "/v1/jwt/login";

const TOKEN_KEYS = ["accesstoken", "access_token", "jwttoken", "jwt_token", "token", "jwt"];
const REFRESH_KEYS = ["refreshtoken", "refresh_token"];
const MESSAGE_KEYS = ["message", "errormessage", "error_message", "error", "title", "detail"];

export async function loginWithJwt(credentials: LoginCredentials): Promise<LoginSession> {
  const login = credentials.login.trim();
  const password = credentials.password;
  const producttype = credentials.producttype.trim() || process.env.IAM_PRODUCT_TYPE?.trim() || "TMS";
  const enviroment = credentials.enviroment.trim() || process.env.IAM_ENVIRONMENT?.trim() || "DEV";

  if (!login || !password) {
    throw new IamApiError("Login and password are required.", 400);
  }

  const { status, data } = await iamPostJson(LOGIN_PATH, {
    producttype,
    enviroment,
    login,
    password,
  });

  const root = asRecord(data);
  if (isExplicitFailure(root) || status < 200 || status >= 300) {
    throw new IamApiError(readMessage(root) ?? "Invalid login or password.", status >= 400 ? status : 401);
  }

  const accessToken = readToken(root);
  if (!accessToken) {
    throw new IamApiError(readMessage(root) ?? "Sign-in did not return an access token.", 502);
  }

  const claims = asRecord(decode(accessToken));

  return {
    accessToken,
    refreshToken: readRefreshToken(root),
    user: readUser(root, claims, login),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function getIgnoreCase(record: Record<string, unknown> | null, key: string): unknown {
  if (!record) return undefined;
  const match = Object.keys(record).find((entry) => entry.toLowerCase() === key.toLowerCase());
  return match ? record[match] : undefined;
}

function nestedData(record: Record<string, unknown> | null) {
  return asRecord(getIgnoreCase(record, "data")) ?? asRecord(getIgnoreCase(record, "result"));
}

function firstString(record: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = getIgnoreCase(record, key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function isExplicitFailure(record: Record<string, unknown> | null) {
  const status = getIgnoreCase(record, "status");
  const success = getIgnoreCase(record, "success");
  if (status === false || success === false) return true;
  if (typeof status === "string" && ["fail", "failed", "error"].includes(status.toLowerCase())) return true;
  return false;
}

function readMessage(record: Record<string, unknown> | null) {
  const message = firstString(record, MESSAGE_KEYS) ?? firstString(nestedData(record), MESSAGE_KEYS);
  if (!message || message.includes("<") || message.length > 180) return undefined;
  return message;
}

function readToken(record: Record<string, unknown> | null) {
  const nested = nestedData(record);
  const fromKeys = firstString(record, TOKEN_KEYS) ?? firstString(nested, TOKEN_KEYS);
  if (fromKeys) return fromKeys;

  for (const key of ["data", "result"]) {
    const value = getIgnoreCase(record, key);
    if (typeof value === "string" && value.split(".").length === 3) return value.trim();
  }
  return undefined;
}

function readRole(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim();
  return undefined;
}

function readRefreshToken(record: Record<string, unknown> | null) {
  return firstString(record, REFRESH_KEYS) ?? firstString(nestedData(record), REFRESH_KEYS);
}

function readUser(
  record: Record<string, unknown> | null,
  claims: Record<string, unknown> | null,
  login: string,
): AuthSessionUser {
  const bodyUser =
    asRecord(getIgnoreCase(record, "user")) ??
    asRecord(getIgnoreCase(nestedData(record), "user")) ??
    nestedData(record);
  const email =
    firstString(claims, ["login_email", "email", "preferred_username", "unique_name", "upn"]) ??
    firstString(bodyUser, ["login_email", "email", "loginEmail", "username", "login"]) ??
    (login.includes("@") ? login : `${login}@local`);
  const fullName =
    firstString(claims, ["name", "given_name", "unique_name"]) ??
    firstString(bodyUser, ["fullName", "fullname", "name", "displayName", "displayname"]) ??
    (email.includes("@") ? (email.split("@")[0] ?? email) : login);
  const roleValue =
    getIgnoreCase(claims, "user_type") ??
    getIgnoreCase(claims, "role") ??
    getIgnoreCase(claims, "roles") ??
    getIgnoreCase(bodyUser, "role") ??
    getIgnoreCase(bodyUser, "userRole");
  const role = readRole(roleValue) ?? "User";
  const phoneNumber =
    firstString(claims, ["mobile", "phone", "phone_number"]) ??
    firstString(bodyUser, ["phoneNumber", "phonenumber", "phone", "mobile"]);

  return {
    fullName,
    email,
    role,
    ...(phoneNumber ? { phoneNumber } : {}),
  };
}
