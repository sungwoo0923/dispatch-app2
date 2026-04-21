export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { tokens, title, body } = req.body;
  if (!tokens?.length) return res.status(200).json({ ok: true });

  const SERVER_KEY = process.env.FCM_SERVER_KEY;

  const results = await Promise.allSettled(
    tokens.map((token) =>
      fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `key=${SERVER_KEY}`,
        },
        body: JSON.stringify({
          to: token,
          priority: "high",
          notification: { title, body, sound: "default" },
          data: { title, body },
        }),
      })
    )
  );

  res.status(200).json({ sent: results.length });
}