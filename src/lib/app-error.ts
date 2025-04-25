export class AppError extends Error {
  statusCode: number;

  constructor(errorMessage: string, statusCode: number, name = 'AppError') {
    super(errorMessage);
    this.name = name;
    this.statusCode = statusCode;
  }
}

export class AppSignInError extends AppError {
  constructor(
    errorMessage = 'Incorrect username or password',
    statusCode = 400
  ) {
    super(errorMessage, statusCode, 'SignInError');
  }
}

export class AppInvalidIdError extends AppError {
  constructor(errorMessage = 'Invalid id', statusCode = 400) {
    super(errorMessage, statusCode, 'InvalidIdError');
  }
}

export class AppNotFoundError extends AppError {
  constructor(errorMessage = 'Not found', statusCode = 404) {
    super(errorMessage, statusCode, 'NotFoundError');
  }
}

export class AppUniqueConstraintViolationError extends AppError {
  constructor(fieldName: string, errorMessage = '', statusCode = 400) {
    if (!errorMessage) errorMessage = `${fieldName} already exists`;
    super(errorMessage, statusCode, 'UniqueConstraintViolationError');
  }
}

export default AppError;
