const AppError = require("../utils/AppError");

const allowRoles = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError(403, "You do not have permission to access this resource."));
  }
  next();
};

exports.authorizeAdmin = allowRoles("ADMIN");
exports.authorizeRepresentative = allowRoles("COMPANY_REPRESENTATIVE");
exports.authorizeCollector = allowRoles("COLLECTOR");
exports.authorizeHousehold = allowRoles("HOUSEHOLD");
exports.authorizeAdminOrRepresentative = allowRoles("ADMIN", "COMPANY_REPRESENTATIVE");
exports.authorizeHouseholdReader = allowRoles("ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR");
exports.authorizeHouseholdManager = allowRoles("ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR");
exports.authorizeBinReader = allowRoles("ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR");
exports.authorizeBinManager = allowRoles("ADMIN", "COLLECTOR");
exports.authorizeCollectionManager = allowRoles("ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR");
exports.authorizeCollectionDeleter = allowRoles("ADMIN", "COMPANY_REPRESENTATIVE");
