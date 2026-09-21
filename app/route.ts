import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    name: "tms-web",
    apis: [
      "GET /api/v1/auth/users",
      "POST /api/v1/auth/users",
      "POST /api/v1/db/session",
      "POST /api/v1/crypto/encrypt",
      "POST /api/v1/crypto/decrypt",
    ],
  });
}
