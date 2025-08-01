// <= IMPORTS =>
import jwt from "jsonwebtoken";

// <= AUTHENTICATION =>
const isAuthenticated = (req, res, next) => {
  // CHECKING FOR TOKEN IN REQUEST COOKIES
  const token = req.cookies.token;
  // IF NO TOKEN FOUND
  if (!token) {
    return res
      .status(401)
      .json({ message: "Unauthorized to Perform Action!", success: false });
  }
  // INITIATING DECODED TOKEN
  let decodedToken;
  try {
    // DECODING THE ACCESS TOKEN
    decodedToken = jwt.verify(token, process.env.AT_SECRET);
  } catch (error) {
    // IF TOKEN EXPIRED TRIGGERING REFRESH TOKEN ON CLIENT SIDE
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Unauthorized to Perform Action!",
        success: false,
      });
    }
    // IF INVALID TOKEN OR OTHER ERRORS
    return res
      .status(401)
      .json({ message: "Invalid Token Found", success: false });
  }
  // RETRIEVING USER ID FROM DECODED TOKEN
  req.id = decodedToken.userId;
  next();
};

export default isAuthenticated;
