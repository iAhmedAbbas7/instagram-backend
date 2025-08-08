// <= IMPORTS =>
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { v4 as uuid } from "uuid";
import getDataURI from "../utils/dataURI.js";
import { User } from "../models/user.model.js";
import cloudinary from "../utils/cloudinary.js";
import { Settings } from "../models/settings.model.js";
import expressAsyncHandler from "express-async-handler";
import { RefreshToken } from "../models/refreshToken.model.js";
import { getReceiverSocketId, io } from "../services/socket.js";

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
    gender: "",
  });
  // RETURNING RESPONSE
  return res.status(201).json({
    message: `User ${fullName} Registered Successfully!`,
    success: true,
  });
});

// <= CHECK USERNAME AVAILABILITY =>
export const checkUsernameAvailability = expressAsyncHandler(
  async (req, res) => {
    // GETTING USERNAME FROM REQUEST QUERY
    const username = req.query.username;
    // IF USERNAME NOT PROVIDED
    if (!username) {
      return res
        .status(400)
        .json({ message: "Username is Required!", success: false });
    }
    // CHECKING IF THE USERNAME ALREADY EXISTS
    const usernameExists = await User.findOne({ username: username.trim() })
      .lean()
      .exec();
    // RETURNING RESPONSE
    return res.status(200).json({ success: true, available: !usernameExists });
  }
);

// <= USER LOGIN =>
export const userLogin = expressAsyncHandler(async (req, res) => {
  // GETTING USER DATA FROM REQUEST BODY
  const { identifier, password } = req.body;
  // VALIDATING USER DATA
  if (!identifier && !password) {
    return res.status(400).json({
      message: "Email or Username & Password are Required!",
      success: false,
    });
  }
  // IF EMAIL IS NOT PROVIDED
  if (!identifier && password) {
    return res
      .status(400)
      .json({ message: "Email or Username is Required!", success: false });
  }
  // IF PASSWORD IS NOT PROVIDED
  if (identifier && !password) {
    return res
      .status(400)
      .json({ message: "Password is Required!", success: false });
  }
  // FINDING THE USER IN THE USER MODEL THROUGH IDENTIFIER
  const foundUser = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  })
    .lean()
    .exec();
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
  // CHECKING FOR PREVIOUS ISSUED TOKENS AND CLEARING THEM
  await RefreshToken.deleteMany({
    userId: foundUser._id,
    revoked: false,
  });
  // SETTING TOKEN DATA
  const tokenData = {
    userId: foundUser._id,
  };
  // SIGNING ACCESS TOKEN
  const accessToken = jwt.sign(tokenData, process.env.AT_SECRET, {
    expiresIn: process.env.AT_EXPIRES_IN,
  });
  // SETTING REFRESH TOKEN ID
  const refreshTokenId = uuid();
  // SIGNING REFRESH TOKEN
  const refreshToken = jwt.sign(tokenData, process.env.RT_SECRET, {
    expiresIn: process.env.RT_EXPIRES_IN,
    jwtid: refreshTokenId,
  });
  // PERSISTING THE REFRESH TOKEN IN THE DATABASE
  await RefreshToken.create({
    tokenId: refreshTokenId,
    userId: foundUser._id,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  // SETTING USER TO RETURN
  const user = await User.findById(foundUser._id)
    .select("-password -__v")
    .exec();
  // FINDING SETTING FOR THE USER
  const settings = await Settings.findOneAndUpdate(
    { user: foundUser._id },
    {
      $setOnInsert: {
        ads: {},
        support: {},
        accounts: {},
        payments: {},
        security: {},
        creatorTools: {},
        notifications: {},
        contentPreferences: {},
        privacyInteractions: {},
        displayAccessibility: {},
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    }
  )
    .lean()
    .exec();
  return res
    .status(200)
    .cookie("token", accessToken, {
      maxAge: process.env.AT_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "development" ? false : true,
    })
    .cookie("refreshToken", refreshToken, {
      maxAge: process.env.RT_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "development" ? false : true,
    })
    .json({
      message: `Welcome Back ${foundUser.fullName}`,
      success: true,
      user,
      settings,
    });
});

// <= REFRESH TOKEN =>
export const refreshToken = expressAsyncHandler(async (req, res) => {
  // GETTING THE REFRESH TOKEN FROM REQUEST COOKIES
  const oldRefreshToken = req.cookies.refreshToken;
  // IF NO REFRESH TOKEN FOUND
  if (!oldRefreshToken) {
    return res
      .status(401)
      .json({ message: "Unauthorized to Perform Action!", success: false });
  }
  // INITIATING THE DECODED TOKEN
  let decodedToken;
  // VERIFYING THE REFRESH TOKEN
  try {
    decodedToken = jwt.verify(oldRefreshToken, process.env.RT_SECRET);
  } catch (error) {
    // EXPIRED OR INVALID REFRESH TOKEN
    return res
      .status(401)
      .json({ message: "Unauthorized to Perform Action!", success: false });
  }
  // EXTRACTING THE REFRESH TOKEN ID
  const refreshTokenId = decodedToken.jti;
  // EXTRACTING THE USER IF FROM REFRESH TOKEN
  const userId = decodedToken.userId;
  // FINDING THE REFRESH TOKEN IN THE DATABASE
  const existingRefreshToken = await RefreshToken.findOne({
    tokenId: refreshTokenId,
    userId,
    revoked: false,
  }).lean();
  // IF REFRESH TOKEN NOT FOUND OR IS EXPIRED
  if (
    !existingRefreshToken ||
    existingRefreshToken.expiresAt.getTime() < Date.now()
  ) {
    return res
      .status(401)
      .json({ message: "Unauthorized to Perform Action!", success: false });
  }
  // REVOKING THE OLD REFRESH TOKEN
  await RefreshToken.findOneAndUpdate(
    { tokenId: refreshTokenId, userId, revoked: false },
    {
      revoked: true,
    }
  );
  // DELETING THE OLD REFRESH TOKEN
  await RefreshToken.deleteOne({
    tokenId: refreshTokenId,
    userId,
    revoked: true,
  });
  // SETTING TOKEN DATA
  const tokenData = {
    userId: userId,
  };
  // SIGNING NEW ACCESS TOKEN
  const accessToken = jwt.sign(tokenData, process.env.AT_SECRET, {
    expiresIn: process.env.AT_EXPIRES_IN,
  });
  // SETTING REFRESH TOKEN ID
  const newRefreshTokenId = uuid();
  // SIGNING REFRESH TOKEN
  const newRefreshToken = jwt.sign(tokenData, process.env.RT_SECRET, {
    expiresIn: process.env.RT_EXPIRES_IN,
    jwtid: newRefreshTokenId,
  });
  // PERSISTING THE REFRESH TOKEN IN THE DATABASE
  await RefreshToken.create({
    tokenId: newRefreshTokenId,
    userId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  // SETTING BOTH TOKEN IN RESPONSE COOKIES
  return res
    .status(200)
    .cookie("token", accessToken, {
      maxAge: process.env.AT_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "development" ? false : true,
    })
    .cookie("refreshToken", newRefreshToken, {
      maxAge: process.env.RT_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "development" ? false : true,
    })
    .json({ success: true, message: "Token Refreshed Successfully!" });
});

// <= USER LOGOUT =>
export const userLogout = expressAsyncHandler(async (req, res) => {
  // GETTING THE REFRESH TOKEN FROM REQUEST COOKIES
  const refreshToken = req.cookies.refreshToken;
  // IF REFRESH TOKEN FOUND
  if (refreshToken) {
    try {
      // DECODING THE REFRESH TOKEN
      const decodedToken = jwt.verify(refreshToken, process.env.RT_SECRET);
      // GETTING THE REFRESH TOKEN ID
      const refreshTokenId = decodedToken.jti;
      // GETTING THE USER IF FROM THE REFRESH TOKEN
      const userId = decodedToken.userId;
      // UPDATING THE REFRESH TOKEN IN THE DATABASE
      await RefreshToken.findOneAndUpdate(
        { tokenId: refreshTokenId, userId: userId, revoked: false },
        {
          revoked: true,
        }
      );
      // DELETING THE REFRESH TOKEN FROM DATABASE
      await RefreshToken.deleteOne({
        tokenId: refreshTokenId,
        userId: userId,
        revoked: true,
      });
    } catch (error) {
      // LOGGING ERROR IF TOKEN IS INVALID OR EXPIRED
      console.log("Invalid or Expired Refresh Token", error);
    }
  }
  // CLEARING THE COOKIE
  return res
    .cookie("token", "", { maxAge: 0 })
    .cookie("refreshToken", "", { maxAge: 0 })
    .json({ message: "User Logged Out Successfully!", success: true });
});

// <= SEARCH USERS =>
export const searchUsers = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING SEARCH QUERY FROM REQUEST PARAMS
  const query = (req.query.q || "").trim();
  // IF QUERY IS NOT PROVIDED
  if (!query) {
    return res
      .status(400)
      .json({ message: "Search Query is Required!", success: false });
  }
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId)
    .select("followers following")
    .lean();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // SETTING PRIORITY FOR THE SEARCH
  const priorityIds = Array.from(
    new Set([...(foundUser.followers || []), ...(foundUser.following || [])])
  ).map((id) => new mongoose.Types.ObjectId(id));
  // REGEX QUERY
  const regex = new RegExp(query, "i");
  // SETTING BASE FILTER FOR SEARCH
  const baseFilter = {
    $or: [{ username: { $regex: regex } }, { fullName: { $regex: regex } }],
  };
  // SETTING PROJECTION FOR SEARCH
  const projection = {
    password: 0,
    __v: 0,
  };
  // MAKING PRIORITY SEARCH WITH QUERY
  const prioritySearchResults = await User.find(
    {
      ...baseFilter,
      _id: { $in: priorityIds },
    },
    projection
  )
    .limit(5)
    .lean();
  // SETTING RESULTS
  let results = prioritySearchResults;
  // IF RESULTS LESS THAN 5, THEN FILLING UP WITH OTHER USERS
  if (results.length < 5) {
    // EXCLUDING FORM THE SEARCH
    const excludedIds = priorityIds;
    // FINDING OTHER USERS
    const otherUsers = await User.find(
      {
        ...baseFilter,
        _id: { $nin: excludedIds },
      },
      projection
    )
      .limit(5 - results.length)
      .lean();
    // COMBINING THE RESULTS
    results = results.concat(otherUsers);
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, users: results });
});

// <= SEARCH USERS INFINITE =>
export const searchUsersInfinite = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING QUERY PARAMS FROM REQUEST QUERY
  const query = (req.query.q || "").trim();
  // GETTING PAGE NUMBER AND LIMIT NUMBER FORM REQUEST QUERY
  const { page, limit } = req.query;
  // SETTING PAGE NUMBER FOR SEARCH QUERY
  const pageNumber = Math.max(1, parseInt(page) || 1);
  // SETTING LIMIT NUMBER FOR SEARCH QUERY
  const limitNumber = Math.min(50, parseInt(limit) || 10);
  // SETTING SKIP NUMBER FOR SEARCH QUERY
  const skipNumber = (pageNumber - 1) * limitNumber;
  // IF SEARCH QUERY IS NOT PROVIDED
  if (!query) {
    return res
      .status(400)
      .json({ message: "Search Query is Required!", success: false });
  }
  // CREATING A REGEXP FOR SEARCH QUERY
  const regex = new RegExp(query, "i");
  // BUILDING THE BASE FILTER OBJECT FOR SEARCH
  const baseFilter = {
    $or: [{ username: { $regex: regex } }, { fullName: { $regex: regex } }],
    // EXCLUDING THE CURRENT USER FROM THE RESULT
    _id: { $ne: new mongoose.Types.ObjectId(userId) },
  };
  // COUNTING THE TOTAL NUMBER OF MATCHING USERS
  const totalResults = await User.countDocuments(baseFilter);
  // FETCHING THE PAGE OF RESULTS
  const users = await User.find(baseFilter)
    .select("-password -__v")
    .sort({ username: 1 })
    .skip(skipNumber)
    .limit(limitNumber)
    .lean();
  // COMPUTING IF THERE ARE MORE TO FETCH ON THE NEXT CALL
  const hasMore = skipNumber + users.length < totalResults;
  // RETURNING RESPONSE
  return res.status(200).json({
    success: true,
    users,
    pagination: {
      pageNumber,
      limitNumber,
      totalResults,
      hasMore,
    },
  });
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
  // 1 : FOLLOW BACK USERS => (PEOPLE FOLLOW ME THAT I DON'T FOLLOW)
  const followBackUsers = await User.find({
    _id: { $in: foundUser.followers, $nin: foundUser.following },
  })
    .select("-password -__v")
    .lean();
  // 2 :  MUTUAL FOLLOWERS => (HOW OFTEN USER APPEARS IN MY FOLLOWERS FOLLOWING)
  const mutualFollowers = {};
  // ANALYZING MY FOLLOWING
  const myFollowing = await User.find({ _id: { $in: foundUser.following } })
    .select("following")
    .lean();
  // CHECKING MUTUAL FOLLOWER CHECK FOR EACH OF MY FOLLOWER
  myFollowing.forEach((follower) => {
    follower.following.forEach((candidate) => {
      // EXTRACTING THE EACH USER ID AS CANDIDATE ID
      const candidateID = candidate.toString();
      if (
        // IF USER IS NOT ME
        candidateID !== userId &&
        // IF USER IS NOT IN MY FOLLOWING
        !foundUser.following.includes(candidate) &&
        // IF USER IS NOT FOLLOWED BY ME
        !foundUser.followers.includes(candidate)
      ) {
        // SETTING USERS IN THE MUTUAL FOLLOWERS OBJECT
        mutualFollowers[candidateID] = (mutualFollowers[candidateID] || 0) + 1;
      }
    });
  });
  // SETTING MUTUAL ID'S
  const mutualIds = Object.entries(mutualFollowers)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id)
    .slice(0, 10);
  // FINDING MUTUAL FOLLOWERS THROUGH MUTUAL ID'S
  const mutual = await User.find({ _id: { $in: mutualIds } })
    .select("-password -__v")
    .lean();
  // 3 : POPULAR FOLLOWERS => (FOLLOWERS WITH HIGHEST NUMBER OF FOLLOWERS NOT YET FOLLOWED)
  const POPULAR_LIMIT = 10;
  const popularUsers = await User.find({
    _id: {
      $nin: [...foundUser.following, ...foundUser.followers, userId],
    },
  })
    .sort({ followers: -1 })
    .limit(POPULAR_LIMIT)
    .select("-password -__v")
    .lean();
  // 4 : RANDOM USERS => (IF WE DON'T HAVE REQUIRED NUMBER OF USERS)
  const already = new Set([
    userId,
    ...foundUser.following.map(String),
    ...foundUser.followers.map(String),
    ...mutual.map((u) => u._id.toString()),
    ...popularUsers.map((u) => u._id.toString()),
    ...followBackUsers.map((u) => u._id.toString()),
  ]);
  // REQUIRED USERS
  const needed = Math.max(
    0,
    10 - (followBackUsers.length + mutual.length + popularUsers.length)
  );
  // SETTING THE FILLER ARRAY
  let filler = [];
  // IF USERS ARE REQUIRED
  if (needed > 0) {
    filler = await User.aggregate([
      {
        $match: {
          _id: {
            $nin: Array.from(already).map(
              (id) => new mongoose.Types.ObjectId(id)
            ),
          },
        },
      },
      { $sample: { size: needed } },
      { $project: { password: 0, __v: 0 } },
    ]);
  }
  // COMBINING THE USERS & REMOVING THE DUPLICATES
  const combinedUsers = [
    ...followBackUsers,
    ...mutual,
    ...popularUsers,
    ...filler,
  ];
  // INITIATING A NEW SET FOR THE DUPLICATE USERS
  const seenUsers = new Set();
  // FILTERING THE COMBINED USERS
  const users = combinedUsers
    .filter((u) => {
      // SETTING THE UD
      const id = u._id.toString();
      // IF THE USER IS ALREADY PRESENT, THEN SKIPPING IT
      if (seenUsers.has(id)) return false;
      // IF THE USER IS NOT ALREADY PRESENT, ADDING IT
      seenUsers.add(id);
      return true;
    })
    .slice(0, 10);
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, users });
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
    // CREATING THE NOTIFICATION OBJECT
    const notification = {
      type: "unfollow",
      followingUserId: followingUserId,
      followedUserId: followedUserId,
      followingUser,
      message: `${followingUser.username} removed You from their Following`,
      createdAt: new Date(),
    };
    // GETTING THE FOLLOWED USER SOCKET ID
    const followedSocketId = getReceiverSocketId(followedUserId);
    // IF FOLLOWED SOCKET ID EXISTS
    if (followedSocketId) {
      // EMITTING REAL TIME NOTIFICATION FOR THE EVENT
      io.to(followedSocketId).emit("followAction", notification);
    }
    // RETURNING RESPONSE
    return res.status(200).json({
      message: `User ${followedUser.username} Removed from Following`,
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
    // CREATING THE NOTIFICATION OBJECT
    const notification = {
      type: "follow",
      followingUserId: followingUserId,
      followedUserId: followedUserId,
      followingUser,
      message: `${followingUser.username} started Following You`,
      createdAt: new Date(),
    };
    // GETTING THE FOLLOWED USER SOCKET ID
    const followedSocketId = getReceiverSocketId(followedUserId);
    // IF FOLLOWED SOCKET ID EXISTS
    if (followedSocketId) {
      // EMITTING REAL TIME NOTIFICATION FOR THE EVENT
      io.to(followedSocketId).emit("followAction", notification);
    }
    // RETURNING RESPONSE
    return res.status(200).json({
      message: `You Started Following ${followedUser.username}`,
      success: true,
    });
  }
});
