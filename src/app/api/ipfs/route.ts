import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT;

  if (!jwt) {
    return NextResponse.json(
      { error: "Missing PINATA_JWT" },
      { status: 500 }
    );
  }

  const body = await request.json();
  let response: Response;

  try {
    response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pinataMetadata: {
          name: `somnia-dream-${Date.now()}`
        },
        pinataContent: body
      })
    });
  } catch {
    return NextResponse.json(
      { error: "PINATA_NETWORK" },
      { status: 502 }
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { error: "PINATA_FORBIDDEN" },
        { status: response.status }
      );
    }

    return NextResponse.json(
      { error: "IPFS upload failed" },
      { status: response.status }
    );
  }

  const json = (await response.json()) as { IpfsHash: string };
  return NextResponse.json({ uri: `ipfs://${json.IpfsHash}` });
}
