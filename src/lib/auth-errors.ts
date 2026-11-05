const endedSessionCodes = new Set([
  "bad_jwt",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
  "session_not_found",
]);

export function isEndedSession(error: {
  name: string;
  status?: number;
  code?: string;
}) {
  return (
    error.name === "AuthSessionMissingError" ||
    error.status === 401 ||
    error.status === 403 ||
    (error.code !== undefined && endedSessionCodes.has(error.code))
  );
}
