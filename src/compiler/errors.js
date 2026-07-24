export class ForgeError extends Error {
  constructor(
    message,
    { phase = "compile", position = null, code = null } = {},
  ) {
    super(message);
    this.name = "ForgeError";
    this.phase = phase;
    this.position = position;
    this.code = code;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      phase: this.phase,
      position: this.position,
      code: this.code,
    };
  }
}

export function atPosition(message, position) {
  if (!position) return message;
  return `${message} at line ${position.line}:${position.column}`;
}

export function normalizeError(error, fallbackPhase = "compile") {
  if (error instanceof ForgeError) return error;
  if (error instanceof Error) {
    return new ForgeError(error.message, { phase: fallbackPhase });
  }
  return new ForgeError(String(error), { phase: fallbackPhase });
}
