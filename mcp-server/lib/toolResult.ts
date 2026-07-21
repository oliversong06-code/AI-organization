export function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function err(message: string, code?: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message, code }, null, 2) }],
    isError: true,
  };
}
