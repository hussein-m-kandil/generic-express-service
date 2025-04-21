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

export default AppError;
