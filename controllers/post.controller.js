// <= IMPORTS =>
import sharp from "sharp";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import cloudinary from "../utils/cloudinary.js";
import { Comment } from "../models/comment.model.js";
import expressAsyncHandler from "express-async-handler";
import { getReceiverSocketId, io, userSocketMap } from "../services/socket.js";

// <= ADD NEW POST =>
export const addNewPost = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE POST CAPTION FROM REQUEST BODY
  const { caption, location } = req.body;
  // GETTING THE POST IMAGE FROM REQUEST FILE
  const postImage = req.file;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // IF IMAGE IS NOT PROVIDED
  if (!postImage) {
    return res
      .status(400)
      .json({ message: "Image is Required!", success: false });
  }
  // OPTIMIZED IMAGE BUFFER FOR STORAGE
  const optimizedImageBuffer = await sharp(postImage.buffer)
    .resize({ width: 800, height: 800, fit: "inside" })
    .toFormat("jpeg", { quality: 100 })
    .toBuffer();
  // GETTING THE DATA URI OF THE FILE FROM HANDLER
  const fileURI = `data:image/jpeg;base64,${optimizedImageBuffer.toString(
    "base64"
  )}`;
  // CLOUDINARY UPLOAD
  const cloudResponse = await cloudinary.uploader.upload(fileURI);
  // IF CLOUDINARY UPLOAD FAILS
  if (!cloudResponse) {
    return res
      .status(500)
      .json({ message: "Failed to Upload Image!", success: false });
  }
  // UPLOADED IMAGE SECURE URL & PUBLIC ID
  const imageSecureURL = cloudResponse.secure_url;
  const imagePublicId = cloudResponse.public_id;
  // CREATING NEW POST
  const post = await Post.create({
    caption,
    location: location || "",
    image: imageSecureURL,
    imagePublicId: imagePublicId,
    author: userId,
  });
  // ADDING POST ID TO THE USER'S POST ARRAY
  foundUser.posts.push(post._id);
  // SAVING THE USER
  await foundUser.save();
  // POPULATING THE AUTHOR DETAILS IN THE POST
  await post.populate({ path: "author", select: "-password -__v" });
  // RETURNING RESPONSE
  return res
    .status(201)
    .json({ message: "Post Created Successfully!", success: true, post });
});

// <= GET ALL POSTS =>
export const getAllPosts = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // PAGINATION LIMIT NUMBER
  const limitNumber = parseInt(req.query.limit, 10);
  // PAGINATION SKIP NUMBER
  const skipNumber = parseInt(req.query.skip, 10);
  // IF NO SKIP OR LIMIT NUMBER IS PROVIDED
  if (isNaN(skipNumber) || isNaN(limitNumber) || limitNumber <= 0) {
    return res.status(400).json({
      message: "Must Provide Positive Skip & Limit Number",
      success: false,
    });
  }
  // BUILDING THE PAGINATED QUERY
  const posts = await Post.find()
    .sort({ createdAt: -1 })
    .skip(skipNumber)
    .limit(limitNumber)
    .populate({
      path: "author",
      select: "username fullName profilePhoto followers following posts",
    })
    .populate({
      path: "comments",
      options: { sort: { createdAt: -1 } },
      populate: {
        path: "author",
        select: "username fullName profilePhoto followers following posts",
      },
    });
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, posts });
});

// <= GET POST BY ID =>
export const getPostById = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE POST ID FROM REQUEST PARAMS
  const postId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING THE POST THROUGH POST ID
  const foundPost = await Post.findById(postId)
    .select("-comments")
    .populate({
      path: "author",
      select: "username fullName profilePhoto followers following posts",
    })
    .exec();
  // IF POST NOT FOUND
  if (!foundPost) {
    return res.status(404).json({ message: "Post Not Found!", success: false });
  }
  // RETURNING POST
  return res.status(200).json({ success: true, post: foundPost });
});

// <= GET USER POSTS =>
export const getUserPosts = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // GETTING THE USER'S POSTS
  const posts = await Post.find({ author: userId })
    .sort({ createdAt: -1 })
    .populate({
      path: "author",
      select: "username fullName profilePhoto followers following posts",
    })
    .populate({
      path: "comments",
      sort: { createdAt: -1 },
      populate: {
        path: "author",
        select: "username fullName profilePhoto followers following posts",
      },
    });
  //  IF NO POSTS FOUND
  if (!posts || posts.length === 0) {
    return res.status(404).json({ message: "No Posts Found!", success: false });
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, posts });
});

// <= GET RECENT POSTS =>
export const getRecentPosts = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE ID OF THE YSER WHOSE POSTS ARE REQUESTED FROM REQUEST PARAMS
  const requestedUserId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING THE USER WHOSE POSTS ARE REQUIRED
  const requestedUser = await User.findById(requestedUserId).exec();
  // IF USER NOT FOUND
  if (!requestedUser) {
    return res
      .status(404)
      .json({ message: "Requested User Not Found!", success: false });
  }
  // GETTING THE POSTS OF THE REQUESTED USER
  const posts = await Post.find({ author: requestedUser })
    .sort({ createdAt: -1 })
    .limit(3)
    .select("image");
  // IF NO POSTS FOUND
  if (!posts || posts.length === 0) {
    return res.status(200).json({ success: true, posts: [] });
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, posts });
});

// <= GET POST COMMENTS =>
export const getPostComments = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING POST ID FROM REQUEST PARAMS
  const postId = req.params.id;
  // GETTING LIMIT & CURSOR FORM REQUEST QUERY
  const { limit = 10, cursor } = req.query;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // TOTAL COUNT OF COMMENTS FOR THE POST
  const totalComments = await Comment.countDocuments({ post: postId });
  // BUILDING QUERY OBJECT
  const query = { post: postId };
  // IF CURSOR IS PROVIDED, ONLY COMMENTS OLDER THAN THAT
  if (cursor) query.createdAt = { $lt: new Date(cursor) };
  // FETCHING THE NEXT PAGE OF COMMENTS
  const comments = await Comment.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10))
    .populate(
      "author",
      "username fullName profilePhoto posts followers following"
    )
    .exec();
  // DETERMINING THE NEXT CURSOR BASED ON THE TIMESTAMP F THE LAST ITEM
  const nextCursor = comments.length
    ? comments[comments.length - 1].createdAt.toISOString()
    : null;
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ success: true, comments, nextCursor, totalComments });
});

// <= GET OTHER POSTS BY USER =>
export const getOtherPostsByUser = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE EXCLUDED POST ID FROM REQUEST PARAMS
  const excludedPostId = req.params.excludedId;
  // GETTING POST AUTHOR ID FROM REQUEST PARAMS
  const authorId = req.params.authorId;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING AUTHOR IN THE USER MODEL THROUGH AUTHOR ID
  const author = await User.findById(authorId).exec();
  // IF AUTHOR NOT FOUND
  if (!author) {
    return res
      .status(404)
      .json({ message: "Author Not Found!", success: false });
  }
  // FINDING POSTS FOR THE AUTHOR
  const posts = await Post.find({
    author: authorId,
    _id: { $ne: excludedPostId },
  })
    .sort({ createdAt: -1 })
    .limit(6)
    .populate({
      path: "author",
      select: "username fullName profilePhoto followers following posts",
    })
    .populate({
      path: "comments",
      sort: { createdAt: -1 },
      populate: {
        path: "author",
        select: "username fullName profilePhoto followers following posts",
      },
    });
  // IF NO POSTS FOUND
  if (!posts || posts.length === 0) {
    return res.status(200).json({ success: true, posts: [] });
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, posts });
});

// <= LIKE POST =>
export const likeOrUnlikePost = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE POST ID FROM REQUEST PARAMS
  const postId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING THE POST THROUGH POST ID
  const foundPost = await Post.findById(postId).exec();
  // IF POST NOT FOUND
  if (!foundPost) {
    return res.status(404).json({ message: "Post Not Found!", success: false });
  }
  // SETTING POST AUTHOR ID
  const postAuthorId = foundPost.author.toString();
  // CHECKING IF ALREADY LIKED BY THE CURRENT USER
  const isAlreadyLiked = foundPost.likes.includes(userId);
  // ADDING OR REMOVING THE USER ID FROM THE LIKES ARRAY
  if (isAlreadyLiked) {
    // IF USER HAS ALREADY LIKED THE POST, THEN UNLIKE IT
    foundPost.likes = foundPost.likes.filter(
      (like) => like.toString() !== userId
    );
  } else {
    // IF USER HAS NOT ALREADY LIKED, THEN LIKE IT
    foundPost.likes.push(userId);
  }
  // CURRENT ACTION PERFORMER
  const actingUser = await User.findById(userId)
    .select("-password -__v")
    .exec();
  // BUILDING THE NOTIFICATION OBJECT BASED ON THE ACTION PERFORMED BY THE USER
  const notification = {
    type: isAlreadyLiked ? "dislike" : "like",
    userId,
    postId,
    postAuthorId,
    [`${isAlreadyLiked ? "dislikingUser" : "likingUser"}`]: actingUser,
    message: isAlreadyLiked
      ? `${actingUser.username} Disliked your Post`
      : `${actingUser.username} Liked your Post`,
    createdAt: new Date(),
  };
  // EMITTING THE REAL TIME NOTIFICATION FOR THE ACTION
  if (postAuthorId === userId) {
    // GETTING POST AUTHOR ID
    const mySocketId = getReceiverSocketId(userId);
    // EMITTING TO EVERYONE EXCEPT THE USER FOR THEIR OWN POST ACTION
    Object.values(userSocketMap).forEach((socketId) => {
      if (socketId !== mySocketId) {
        // EMITTING TO EVERYONE EXCEPT THE POST
        io.to(socketId).emit("notification", notification);
      }
    });
  } else {
    // EMITTING TO EVERYONE
    Object.values(userSocketMap).forEach((socketId) => {
      // EMITTING TO EVERYONE
      io.to(socketId).emit("notification", notification);
    });
  }
  // SAVING THE POST
  await foundPost.save();
  // RETURNING RESPONSE
  return res.status(200).json({
    message: `${
      foundPost.likes.includes(userId) ? "Post Liked!" : "Like Removed!"
    }`,
    success: true,
  });
});

// <= POST COMMENT =>
export const postComment = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE POST ID FROM REQUEST PARAMS
  const postId = req.params.id;
  // GETTING THE COMMENT TEXT FROM REQUEST BODY
  const { text } = req.body;
  // IF COMMENT TEXT IS NOT PROVIDED
  if (!text.trim()) {
    return res
      .status(400)
      .json({ message: "Comment Text is Required!", success: false });
  }
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING THE POST THROUGH POST ID
  const foundPost = await Post.findById(postId).exec();
  // IF POST NOT FOUND
  if (!foundPost) {
    return res.status(404).json({ message: "Post Not Found!", success: false });
  }
  // SETTING POST AUTHOR ID
  const postAuthorId = foundPost.author.toString();
  // CREATING A NEW COMMENT
  const comment = await Comment.create({
    text,
    author: userId,
    post: postId,
  });
  // POPULATING THE COMMENT
  await comment.populate({
    path: "author",
    select: "username fullName profilePhoto followers following posts",
  });
  // ADDING THE COMMENT TO THE POST COMMENTS ARRAY
  foundPost.comments.push(comment._id);
  // SAVING THE POST
  await foundPost.save();
  // BUILDING THE NOTIFICATION OBJECT
  const notification = {
    type: "comment",
    userId,
    postId,
    postAuthorId,
    commentingUser: comment.author,
    commentId: comment._id,
    message: `${comment.author.username} Commented on your Post`,
    createdAt: new Date(),
  };
  // SETTING PAYLOAD FOR THE EVENT
  const payload = { notification, comment };
  // EMITTING EVENT TO ALL ACTIVE SOCKETS
  Object.values(userSocketMap).forEach((socketId) => {
    io.to(socketId).emit("comment", payload);
  });
  // RETURNING RESPONSE
  return res
    .status(201)
    .json({ message: "Comment Posted!", success: true, comment });
});

// <= GET POST LIKES =>
export const getPostLikes = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE POST ID FROM REQUEST PARAMS
  const postId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING THE POST THROUGH POST ID
  const foundPost = await Post.findById(postId).exec();
  // IF POST NOT FOUND
  if (!foundPost) {
    return res.status(404).json({ message: "Post Not Found!", success: false });
  }
  // SETTING POST LIKES LENGTH
  const postLikesLength = foundPost.likes.length;
  // SETTING POST LIKES ARRAY
  const postLikesArray = foundPost.likes;
  // SETTING DEFAULT LIMIT NUMBER FOR FETCHING LIKES
  const DEFAULT_LIMIT = 10;
  // GETTING LAST INDEX FROM CLIENT SIDE
  const lastIndex = parseInt(req.query.lastIndex, 10);
  // COMPUTING START SLICE BOUNDARIES
  const startIndex = isNaN(lastIndex) ? 0 : lastIndex;
  // COMPUTING END SLICE BOUNDARIES
  const endIndex = Math.min(startIndex + DEFAULT_LIMIT, postLikesLength);
  // SLICING THE LIKED IDS
  const slicedIds = postLikesArray.slice(startIndex, endIndex);
  // FETCHING THE SLICED USERS FROM USER MODEL
  let likesPage = await User.find({ _id: { $in: slicedIds } })
    .select("username fullName profilePhoto followers following posts")
    .lean();
  // PRESERVING THE ORIGINAL ORDER OF THE LIKE USERS
  likesPage = slicedIds.map((id) =>
    likesPage.find((u) => u._id.toString() === id.toString())
  );
  // RETURNING RESPONSE
  return res.status(200).json({
    success: true,
    likes: likesPage,
    nextIndex: endIndex < postLikesLength ? endIndex : null,
  });
});

// <= EDIT POST =>
export const editPost = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE POST ID FROM REQUEST PARAMS
  const postId = req.params.id;
  // GETTING POST CAPTION FROM REQUEST BODY
  const { caption } = req.body;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING THE POST THROUGH POST ID
  const foundPost = await Post.findById(postId).exec();
  // IF POST NOT FOUND
  if (!foundPost) {
    return res.status(404).json({ message: "Post Not Found!", success: false });
  }
  // CHECKING IF THE POST BELONGS TO THE USER
  if (foundPost.author.toString() !== userId) {
    return res.status(403).json({ message: "Access Denied!", success: false });
  }
  // SAVING THE UPDATED CAPTION FOR THE POST
  foundPost.caption = caption;
  // SAVING THE POST
  await foundPost.save();
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ message: "Post Updated Successfully!", success: true });
});

// <= DELETE POST =>
export const deletePost = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE POST ID FROM REQUEST PARAMS
  const postId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING THE POST THROUGH POST ID
  const foundPost = await Post.findById(postId).exec();
  // IF POST NOT FOUND
  if (!foundPost) {
    return res.status(404).json({ message: "Post Not Found!", success: false });
  }
  // CHECKING IF THE POST BELONGS TO THE USER
  if (foundPost.author.toString() !== userId) {
    return res.status(403).json({ message: "Access Denied!", success: false });
  }
  // DELETING THE POST IMAGE FROM THE CLOUDINARY
  await cloudinary.uploader.destroy(foundPost.imagePublicId);
  // DELETING THE POST
  await foundPost.deleteOne();
  // REMOVING THE POST ID FROM THE AUTHOR'S POSTS ARRAY
  foundUser.posts = foundUser.posts.filter(
    (post) => post.toString() !== postId
  );
  // SAVING THE USER
  await foundUser.save();
  // DELETING THE COMMENTS ASSOCIATED FOR THE POST
  await Comment.deleteMany({ post: postId });
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ message: "Post Deleted Successfully!", success: true });
});

// <= BOOKMARK POST =>
export const bookOrUnBookmarkPost = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE POST ID FROM REQUEST PARAMS
  const postId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING THE POST THROUGH POST ID
  const foundPost = await Post.findById(postId).exec();
  // IF POST NOT FOUND
  if (!foundPost) {
    return res.status(404).json({ message: "Post Not Found!", success: false });
  }
  // ADDING OR REMOVING THE POST ID FROM THE USER'S BOOKMARKS ARRAY
  if (foundUser.bookmarks.includes(postId)) {
    // IF POST IS ALREADY BOOKMARKED, THEN UN-BOOKMARK IT
    foundUser.bookmarks = foundUser.bookmarks.filter(
      (bookmark) => bookmark.toString() !== postId
    );
    // SAVING THE USER
    await foundUser.save();
    // RETURNING RESPONSE
    return res
      .status(200)
      .json({ message: "Post Removed from Bookmarks!", success: true });
  } else {
    // IF POST IS NOT BOOKMARKED, THEN BOOKMARK IT
    foundUser.bookmarks.push(postId);
    // SAVING THE USER
    await foundUser.save();
    // RETURNING RESPONSE
    return res
      .status(200)
      .json({ message: "Post Added to Bookmarks!", success: true });
  }
});
