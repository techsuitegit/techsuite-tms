export class ApiServiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ApiServiceError";
  }
}

export class ValidationError extends ApiServiceError {
  constructor(message: string) {
    super(message, 400);
    this.name = "ValidationError";
  }
}

export class ConfigurationError extends ApiServiceError {
  constructor(message: string) {
    super(message, 500);
    this.name = "ConfigurationError";
  }
}

export class UnauthorizedError extends ApiServiceError {
  constructor(message = "Unauthorized") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class DatabaseConnectionError extends ApiServiceError {
  constructor(message = "Unable to connect using the login database credentials") {
    super(message, 502);
    this.name = "DatabaseConnectionError";
  }
}
