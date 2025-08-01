// <= IMPORTS =>
import helmet from "helmet";

// <= HELMET MIDDLEWARE CONFIGURATION =>
const helmetMiddleware = () => {
  return helmet({
    contentSecurityPolicy: false,
  });
};

export default helmetMiddleware;
