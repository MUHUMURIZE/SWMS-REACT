const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./openapi");

const swaggerOptions = {
  explorer: true,
  persistAuthorization: true,
  displayRequestDuration: true,
  docExpansion: "list",
  filter: true,
};

module.exports = {
  swaggerSpec,
  swaggerUi,
  swaggerOptions,
};
