# Generic Express Service

A generic Express.js back-end service designed to support multiple front-end apps that I am managing to build in parallel with this app. It includes RESTful API endpoints and user authentication and utilizes PostgreSQL for data persistence.

## Features

- RESTful API with various endpoints serving different purposes
- User management and authentication endpoints
- Local PostgreSQL integration via Docker Compose
- TypeScript support with `tsx` for development
- Environment-based configuration
- Tested using Vitest and Supertest
- Ready for integration with front-end applications

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (tested on v22 but v20 should be fine too)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/hussein-m-kandil/generic-express-service.git
   cd generic-express-service
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up the environment variables:**

   ```bash
   cp .env.test .env
   # Then edit `.env` to fit your local setup
   ```

4. **Start the PostgreSQL service:**

   ```bash
   npm run pg:up
   ```

5. **Push the Prisma schema to the database:**

   ```bash
   npx prisma db push
   ```

6. **Start the development server:**

   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:8080`.

## Running Tests

```bash
npm run test -- --run
```

## Manual Testing

There are several HTTP request examples in `.rest` files located in the `/requests` directory. These can be used to manually test the API using the _[REST Client (VS Code extension)](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)_, while the development server is running with the command `npm run dev`.

## Deployment

Every _push_ or _pull request (PR)_ on main branch, the app will be deployed to production automatically _if it passes all tests and checks performed by [a GitHub action for deployment preparation](./.github/workflows/deployment-prep.yml)_.

## Notes

- This service is intended to support multiple front-end projects that I build.
- CORS is configured to allow only specific front-end origins under my control.
- JWT-based authentication is implemented and required by some endpoint.
- The `Bearer` schema is included in the authentication response, so _send your token as it is_ via an `Authorization` header.
- All error responses has the proper status code, but not all of them has a body. If an error response has a body it will have _at least_ the following:

  ```json
  {
    "error": {
      "message": "An example error"
    }
  }
  ```

- A validation error response body will have the form of _[ZodError.issues](https://zod.dev/?id=error-handling)._
