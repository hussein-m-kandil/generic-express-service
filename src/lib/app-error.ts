export class AppBaseError extends Error {
  statusCode: number;

  constructor(errorMessage: string, statusCode: number, name = 'AppError') {
    super(errorMessage);
    this.name = name;
    this.statusCode = statusCode;
  }
}

export class AppSignInError extends AppBaseError {
  constructor(
    errorMessage = 'Incorrect username or password',
    statusCode = 400
  ) {
    super(errorMessage, statusCode, 'SignInError');
  }
}

export class AppInvalidIdError extends AppBaseError {
  constructor(errorMessage = 'Invalid id', statusCode = 400) {
    super(errorMessage, statusCode, 'InvalidIdError');
  }
}

export class AppNotFoundError extends AppBaseError {
  constructor(errorMessage = 'Not found', statusCode = 404) {
    super(errorMessage, statusCode, 'NotFoundError');
  }
}

export class AppUniqueConstraintViolationError extends AppBaseError {
  constructor(fieldName: string, errorMessage = '', statusCode = 400) {
    if (!errorMessage) errorMessage = `${fieldName} already exists`;
    super(errorMessage, statusCode, 'UniqueConstraintViolationError');
  }
}

export default AppBaseError;
