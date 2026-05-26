# Tool Call Error Handling

When a tool call fails with an error:
1. Read the error message carefully to understand what went wrong (path issue, permission denied, malformed JSON, etc.)
2. Fix the root cause — update file paths, adjust arguments, or correct syntax
3. Retry once with corrected parameters
4. If still failing after 2 attempts, explain the issue clearly to the user rather than looping endlessly

Never assume a tool call will succeed without reading its error response first.
