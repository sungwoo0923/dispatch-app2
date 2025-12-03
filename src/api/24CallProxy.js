export async function sendOrderTo24Proxy(row) {
  const res = await fetch("/api/send24", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(row),
  });

  return await res.json();
}
