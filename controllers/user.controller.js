// <= IMPORTS =>
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import getDataURI from "../utils/dataURI.js";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import cloudinary from "../utils/cloudinary.js";
import expressAsyncHandler from "express-async-handler";

// <= USER REGISTRATION =>
export const registerUser = expressAsyncHandler(async (req, res) => {
  // GETTING USER DATA FROM REQUEST BODY
  const { fullName, username, email, password } = req.body;
  // VALIDATING USER DATA
  if (!fullName && !username && !email && !password) {
    return res
      .status(400)
      .json({ message: "All Fields are Required!", success: false });
  }
  // IF FULLNAME IS NOT PROVIDED
  if (!fullName && username && email && password) {
    return res
      .status(400)
      .json({ message: "FullName is Required!", success: false });
  }
  // IF USERNAME IS NOT PROVIDED
  if (fullName && !username && email && password) {
    return res
      .status(400)
      .json({ message: "Username is Required!", success: false });
  }
  // IF EMAIL IS NOT PROVIDED
  if (fullName && username && !email && password) {
    return res
      .status(400)
      .json({ message: "Email is Required!", success: false });
  }
  // IF PASSWORD IS NOT PROVIDED
  if (fullName && username && email && !password) {
    return res
      .status(400)
      .json({ message: "Password is Required!", success: false });
  }
  // CHECKING IF EMAIL IS ALREADY REGISTERED
  const foundUserEmail = await User.findOne({ email }).lean().exec();
  // CHECKING IF USERNAME IS ALREADY REGISTERED
  const foundUserUsername = await User.findOne({ username }).lean().exec();
  // IF BOTH USERNAME & EMAIL ARE ALREADY REGISTERED
  if (foundUserEmail && foundUserUsername) {
    return res.status(409).json({
      message: "Provided Username & Email are Already Registered!",
      success: false,
    });
  }
  // IF EMAIL FOUND
  if (foundUserEmail) {
    return res.status(409).json({
      message: `Provided Email ${email} is Already Registered!`,
      success: false,
    });
  }
  // IF USERNAME FOUND
  if (foundUserUsername) {
    return res.status(409).json({
      message: `Provided Username ${username} is Already Registered!`,
      success: false,
    });
  }
  // HASHING THE PASSWORD
  const hashedPassword = await bcrypt.hash(password, 10);
  // CREATING NEW USER
  const user = await User.create({
    fullName,
    username,
    email,
    password: hashedPassword,
  });
  // RETURNING RESPONSE
  return res.status(201).json({
    message: `User ${fullName} Registered Successfully!`,
    success: true,
    user,
  });
});

// <= USER LOGIN =>
export const userLogin = expressAsyncHandler(async (req, res) => {
  // GETTING USER DATA FROM REQUEST BODY
  const { email, password } = req.body;
  // VALIDATING USER DATA
  if (!email && !password) {
    return res
      .status(400)
      .json({ message: "Email & Password are Required!", success: false });
  }
  // IF EMAIL IS NOT PROVIDED
  if (!email && password) {
    return res
      .status(400)
      .json({ message: "Email is Required!", success: false });
  }
  // IF PASSWORD IS NOT PROVIDED
  if (email && !password) {
    return res
      .status(400)
      .json({ message: "Password is Required!", success: false });
  }
  // FINDING THE USER IN THE USER MODEL THROUGH EMAIL
  const foundUser = await User.findOne({ email }).lean().exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // COMPARING THE PASSWORD
  const isPasswordMatch = await bcrypt.compare(password, foundUser.password);
  // IF PASSWORD DOES NOT MATCH
  if (!isPasswordMatch) {
    return res
      .status(403)
      .json({ message: "Incorrect Password!", success: false });
  }
  // SETTING TOKEN DATA
  const tokenData = {
    userId: foundUser._id,
  };
  // SIGNING TOKEN
  const token = jwt.sign(tokenData, process.env.TOKEN_SECRET_KEY, {
    expiresIn: "1d",
  });
  // SETTING USER TO RETURN
  const user = await User.findById(foundUser._id)
    .select("-password -__v")
    .exec();
  return res
    .status(200)
    .cookie("token", token, {
      maxAge: 1 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "development" ? false : true,
    })
    .json({
      message: `Welcome Back ${foundUser.fullName}`,
      success: true,
      user,
    });
});

// <= USER LOGOUT =>
export const userLogout = expressAsyncHandler(async (_, res) => {
  // CLEARING THE COOKIE
  return res
    .cookie("token", "", { maxAge: 0 })
    .json({ message: "User Logged Out Successfully!", success: true });
});

// <= GETTING USER PROFILE =>
export const getUserProfile = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM THE REQUEST PARAMS
  const userId = req.params.id;
  // IF ID NOT PROVIDED
  if (!req.params.id) {
    return res
      .status(400)
      .json({ message: "User ID is Required!", success: false });
  }
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId)
    .select("-password -__v")
    .populate([
      {
        path: "posts",
        options: { sort: { createdAt: -1 } },
        populate: [
          {
            path: "author",
            select: "username fullName profilePhoto followers following posts",
          },
          {
            path: "comments",
            options: { sort: { createdAt: -1 } },
            populate: {
              path: "author",
              select:
                "username fullName profilePhoto followers following posts",
            },
          },
        ],
      },
      {
        path: "bookmarks",
        options: { sort: { createdAt: -1 } },
        populate: {
          path: "author",
          select: "username fullName profilePhoto followers following posts",
        },
      },
    ])
    .exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, user: foundUser });
});

// <= EDIT USER PROFILE =>
export const editUserProfile = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // GETTING USER DATA FROM REQUEST BODY
  const { bio, gender } = req.body;
  // GETTING THE PROFILE PICTURE FROM THE REQUEST FILE
  const profilePhoto = req.file;
  // IF PROFILE PHOTO WAS PROVIDED
  if (profilePhoto) {
    // GETTING THE PUBLIC ID OF THE PREVIOUS PROFILE PHOTO OF THE USER
    const imagePublicID = foundUser.profilePublicId;
    // DESTROYING THE PREVIOUS PROFILE PICTURE OF THE USER
    if (imagePublicID) await cloudinary.uploader.destroy(imagePublicID);
    // GETTING THE DATA URI OF THE FILE FROM HANDLER
    const fileURI = getDataURI(profilePhoto);
    // CLOUDINARY UPLOAD
    const cloudResponse = await cloudinary.uploader.upload(fileURI.content);
    // IF CLOUDINARY UPLOAD FAILS
    if (!cloudResponse) {
      return res
        .status(500)
        .json({ message: "Failed to Upload Profile Photo!", success: false });
    }
    // SAVING THE PROFILE PHOTO
    foundUser.profilePhoto = cloudResponse.secure_url;
    // SAVING THE PROFILE PHOTO PUBLIC ID
    foundUser.profilePublicId = cloudResponse.public_id;
  }
  // IF BIO WAS PROVIDED
  if (bio) foundUser.bio = bio;
  // IF GENDER WAS PROVIDED
  if (gender) foundUser.gender = gender;
  // SAVING THE USER
  await foundUser.save();
  // SETTING THE USER TO RETURN
  const user = await User.findById(userId).select("-password -__v").exec();
  // RETURNING RESPONSE
  return res.status(200).json({
    message: "Profile Updated Successfully!",
    success: true,
    user,
  });
});

// <= DELETE AVATAR =>
export const deleteAvatar = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).select("-password -__v").exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // GETTING THE PUBLIC ID OF THE PREVIOUS PROFILE PHOTO OF THE USER
  const imagePublicID = foundUser.profilePublicId;
  // DESTROYING THE PREVIOUS PROFILE PICTURE OF THE USER
  await cloudinary.uploader.destroy(imagePublicID);
  // UPDATING PROFILE PHOTO
  foundUser.profilePhoto = "";
  // UPDATING THE IMAGE PUBLIC ID
  foundUser.profilePublicId = "";
  // SAVING THE USER
  await foundUser.save();
  // SETTING THE USER TO RETURN
  const user = await User.findById(userId).select("-password -__v").exec();
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ message: "Avatar Removed!", success: true, user });
});

// <= GET SUGGESTED USERS =>
export const getSuggestedUsers = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING USERS NOT FOLLOWED BY CURRENT USER AND EXCLUDING CURRENT USER
  const suggestedUsers = await User.find({
    _id: { $nin: [...foundUser.following, userId] },
  })
    .select("-password -__v")
    .limit(10)
    .exec();
  // IF NO SUGGESTED USERS FOUND
  if (!suggestedUsers || suggestedUsers.length === 0) {
    return res
      .status(404)
      .json({ message: "No Suggested Users at this Time!", success: false });
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, users: suggestedUsers });
});

// <= FOLLOW/UNFOLLOW USER =>
export const followOrUnfollowUser = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID AS FOLLOWING USER
  const followingUserId = req.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID (FOLLOWING USER)
  const followingUser = await User.findById(followingUserId).exec();
  // IF USER NOT FOUND
  if (!followingUser) {
    return res
      .status(404)
      .json({ message: "Following User Not Found!", success: false });
  }
  // GETTING THE USER ID TO FOLLOW/UNFOLLOW FROM REQUEST PARAMS
  const followedUserId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID (FOLLOWED USER)
  const followedUser = await User.findById(followedUserId).exec();
  // IF USER NOT FOUND
  if (!followedUser) {
    return res
      .status(404)
      .json({ message: "Followed User Not Found!", success: false });
  }
  // IF FOLLOWING USER IS TRYING TO FOLLOW THEMSELVES
  if (followingUserId === followedUserId) {
    return res.status(400).json({
      message: "You Cannot Follow/Unfollow Yourself!",
      success: false,
    });
  }
  // CHECKING IF THE FOLLOWED USER IS ALREADY BEING FOLLOWED
  const isAlreadyFollowing = followingUser.following.includes(followedUserId);
  // IF ALREADY FOLLOWING
  if (isAlreadyFollowing) {
    // REMOVING THE FOLLOWED USER FROM THE FOLLOWING LIST
    followingUser.following = followingUser.following.filter(
      (userId) => userId.toString() !== followedUserId.toString()
    );
    // REMOVING THE FOLLOWING USER FROM THE FOLLOWERS LIST
    followedUser.followers = followedUser.followers.filter(
      (userId) => userId.toString() !== followingUserId.toString()
    );
    // SAVING THE USERS
    await followingUser.save();
    await followedUser.save();
    // RETURNING RESPONSE
    return res.status(200).json({
      message: `User ${followedUser.fullName} Unfollowed Successfully!`,
      success: true,
    });
  } else {
    // ADDING THE FOLLOWED USER TO THE FOLLOWING LIST
    followingUser.following.push(followedUserId);
    // ADDING THE FOLLOWING USER TO THE FOLLOWERS LIST
    followedUser.followers.push(followingUserId);
    // SAVING THE USERS
    await followingUser.save();
    await followedUser.save();
    // RETURNING RESPONSE
    return res.status(200).json({
      message: `User ${followedUser.fullName} Followed Successfully!`,
      success: true,
    });
  }
});
