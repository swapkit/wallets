export function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  const causeMessage = (error as { cause?: { message?: unknown } }).cause?.message;

  return typeof causeMessage === "string" && causeMessage ? causeMessage : error.message;
}
