import { NextResponse } from "next/server";

import { listUsers } from "@/app/api-services/auth/users-service";
import { ApiServiceError } from "@/app/api-services/exceptions";

async function handle(request: Request) {
  try {
    const result = await listUsers(request);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Unable to read users from the tenant database" }, { status: 502 });
  }
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
