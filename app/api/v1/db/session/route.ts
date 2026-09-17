import { NextResponse } from "next/server";

import { ApiServiceError } from "@/app/api-services/exceptions";
import { pingTenantDatabase } from "@/app/api-services/db/tenant-db.service";

export async function POST(request: Request) {
  try {
    const session = await pingTenantDatabase(request);
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof ApiServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Unable to connect using the login database credentials" }, { status: 502 });
  }
}
