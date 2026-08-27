export class PlanningError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "PlanningError";
  }
}

export class ValidationError extends PlanningError {
  constructor(message: string, public readonly issues: any[] = []) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class StaleWriteError extends PlanningError {
  constructor(message = "Stale write detected; expected digest does not match current state.") {
    super(message, "STALE_WRITE");
    this.name = "StaleWriteError";
  }
}

export class StaleStateError extends PlanningError {
  constructor(message = "State changed during proposal inspection; zero writes performed.") {
    super(message, "STALE_STATE");
    this.name = "StaleStateError";
  }
}

export class SlugCollisionError extends PlanningError {
  constructor(public readonly slug: string) {
    super(`A project with slug "${slug}" already exists.`, "SLUG_COLLISION");
    this.name = "SlugCollisionError";
  }
}

export class IdentityCollisionError extends PlanningError {
  constructor(public readonly identity: string) {
    super(`Identity collision detected for "${identity}".`, "IDENTITY_COLLISION");
    this.name = "IdentityCollisionError";
  }
}

export class SourceUnavailableError extends PlanningError {
  constructor(message: string) {
    super(message, "SOURCE_UNAVAILABLE");
    this.name = "SourceUnavailableError";
  }
}
