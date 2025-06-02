// <= IMPORTS =>
import sharp from "sharp";
import cloudinary from "../utils/cloudinary";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import expressAsyncHandler from "express-async-handler";

// <= ADD NEW POST =>
export const addNewPost = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE POST CAPTION FROM REQUEST BODY
  const { caption } = req.body;
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
    .toFormat("jpeg", { quality: 80 })
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
  // GETTING ALL POSTS FOR THE USER
  const posts = await Post.find()
    .sort({ createdAt: -1 })
    .populate({ path: "author", select: "username profilePhoto" })
    .populate({
      path: "comments",
      sort: { createdAt: -1 },
      populate: { path: "author", select: "username profilePhoto" },
    });
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, posts });
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
    .populate({ path: "author", select: "username profilePhoto" })
    .populate({
      path: "comments",
      sort: { createdAt: -1 },
      populate: { path: "author", select: "username profilePhoto" },
    });
  //  IF NO POSTS FOUND
  if (!posts || posts.length === 0) {
    return res.status(404).json({ message: "No Posts Found!", success: false });
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
  // ADDING OR REMOVING THE USER ID FROM THE LIKES ARRAY
  if (foundPost.likes.includes(userId)) {
    // IF USER HAS ALREADY LIKED THE POST, THEN UNLIKE IT
    foundPost.likes = foundPost.likes.filter(
      (like) => like.toString() !== userId
    );
  } else {
    // IF USER HAS NOT ALREADY LIKED, THEN ;IKE IT
    foundPost.likes.push(userId);
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
  // CREATING A NEW COMMENT
  const comment = await Comment.create({
    text,
    author: userId,
    post: postId,
  }).populate({ path: "author", select: "username profilePhoto" });
  // ADDING THE COMMENT TO THE POST COMMENTS ARRAY
  foundPost.comments.push(comment._id);
  // SAVING THE POST
  await foundPost.save();
  // RETURNING RESPONSE
  return res
    .status(201)
    .json({ message: "Comment Posted!", success: true, comment });
});

// <= GET COMMENTS FOR A POST =>
export const getPostComments = expressAsyncHandler(async (req, res) => {
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
  // GETTING ALL COMMENTS FOR THE POST
  const comments = await Comment.find({ post: postId })
    .sort({ createdAt: -1 })
    .populate("author", "username profilePhoto");
  // IF NO COMMENTS FOUND
  if (!comments) {
    return res
      .status(404)
      .json({ message: "No Comments Found!", success: false });
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, comments });
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
