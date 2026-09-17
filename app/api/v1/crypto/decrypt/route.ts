import { NextResponse } from "next/server";

import { ApiServiceError } from "@/app/api-services/exceptions";
import { createCryptoService } from "@/app/api-services/utilities/crypto-factory";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createCryptoService().decrypt(request, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "data is required" }, { status: 400 });
    }
    return NextResponse.json({ message: "Unable to decrypt the given data" }, { status: 400 });
  }
}
