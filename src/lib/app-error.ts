export class AppError extends Error {
  statusCode: number;

  constructor(errorMessage: string, statusCode: number, name = 'AppError') {
    super(errorMessage);
    this.name = name;
    this.statusCode = statusCode;
  }
}

export default AppError;
