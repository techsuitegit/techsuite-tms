import { NextResponse } from "next/server";

import { loginWithJwt } from "@/app/api-services/auth/login-service";
import { IamApiError } from "@/app/shared/http/iam-client";

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const session = await loginWithJwt({
      producttype: readString(body.producttype),
      enviroment: readString(body.enviroment),
      login: readString(body.login),
      password: readString(body.password),
    });
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof IamApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "Invalid Arguments" }, { status: 400 });
    }
    return NextResponse.json({ message: "Unable to sign in right now." }, { status: 502 });
  }
}
