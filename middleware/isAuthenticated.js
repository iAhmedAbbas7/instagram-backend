// <= IMPORTS =>
import jwt from "jsonwebtoken";

// <= AUTHENTICATION =>
const isAuthenticated = (req, res, next) => {
  // CHECKING FOR TOKEN IN REQUEST COOKIES
  const token = req.cookies.token;
  // IF NO TOKEN FOUND
  if (!token) {
    return res.status(401).json({ message: "Unauthorized", success: false });
  }
  // DECODING TOKEN IF FOUND
  const decodedToken = jwt.verify(token, process.env.TOKEN_SECRET_KEY);
  // IF NOT DECODED
  if (!decodedToken) {
    return res
      .status(401)
      .json({ message: "Invalid Token Found", success: false });
  }
  // RETRIEVING USER ID FROM DECODED TOKEN
  req.id = decodedToken.userId;
  next();
};

export default isAuthenticated;
