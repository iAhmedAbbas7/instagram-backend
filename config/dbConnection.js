// <= IMPORTS =>
import mongoose from "mongoose";

// CONNECTING DATABASE
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (err) {
    console.log(err);
  }
};

export default connectDB;
