const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const AppError = require("../utils/AppError");

async function authenticateToken(req, _res, next) {
  try {
    const authorization = req.get("authorization");
    const match = authorization && /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) {
      throw new AppError(401, "A bearer token is required.", "UNAUTHENTICATED");
    }

    let payload;
    try {
      payload = jwt.verify(match[1], process.env.JWT_SECRET);
    } catch {
      throw new AppError(401, "The access token is invalid or expired.", "UNAUTHENTICATED");
    }

    const result = await pool.query(
      `SELECT u.id, u.role, u.token_version
       FROM users u
       LEFT JOIN revoked_tokens rt ON rt.jti = $1
       WHERE u.id = $2 AND rt.jti IS NULL`,
      [payload.jti, payload.id]
    );
    const user = result.rows[0];
    if (!user || user.token_version !== payload.tokenVersion) {
      throw new AppError(401, "The access token is no longer valid.", "UNAUTHENTICATED");
    }

    req.user = {
      id: user.id,
      role: user.role,
      tokenVersion: user.token_version,
      tokenId: payload.jti,
      tokenExpiresAt: payload.exp * 1000,
    };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticateToken };
