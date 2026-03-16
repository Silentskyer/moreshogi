export default async function handler(req, res) {
  const ablyKey = process.env.ABLY_API_KEY;
  if (!ablyKey) {
    res.status(500).json({ error: "Missing ABLY_API_KEY" });
    return;
  }

  const clientId = (req.query?.clientId || "guest").toString();
  const keyName = ablyKey.split(":")[0];
  const authHeader = Buffer.from(ablyKey).toString("base64");

  const tokenRequest = {
    clientId,
    capability: {
      "room:*": ["publish", "subscribe", "presence"],
    },
    ttl: 60 * 60 * 1000,
  };

  const response = await fetch(`https://rest.ably.io/keys/${keyName}/requestToken`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tokenRequest),
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
