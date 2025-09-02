// <= IMPORTS =>
import getDataURI from "../utils/dataURI.js";
import { User } from "../models/user.model.js";
import cloudinary from "../utils/cloudinary.js";
import { Story } from "../models/story.model.js";
import expressAsyncHandler from "express-async-handler";
import { StoryView } from "../models/storyView.model.js";
import mongoose from "mongoose";

// <= CREATE STORY =>
export const uploadAndCreateStory = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING FILES FROM REQUEST FILES
  const files = req.files;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // IF NO FILES PROVIDED
  if (!files || !files.length) {
    return res.status(400).json({
      message: "Media is Required to Create a Story!",
      success: false,
    });
  }
  // INITIATING UPLOADED MEDIA ARRAY
  const uploadedMedias = [];
  // HANDLING FILE UPLOAD FOR EACH PROVIDED FILE
  for (let i = 0; i < files.length; i++) {
    // GETTING INDIVIDUAL FILE
    const file = files[i];
    // GETTING FILE URI DATA
    const fileURI = getDataURI(file);
    // UPLOADING THE MEDIA TO CLOUDINARY
    const cloudResponse = await cloudinary.uploader.upload(fileURI.content, {
      folder: `stories/${userId}`,
      resource_type: "auto",
    });
    // IF NO CLOUD RESPONSE
    if (!cloudResponse) {
      return res
        .status(400)
        .json({ message: "Error Uploading Media!", success: false });
    }
    // DETERMINING THE TYPE & DURATION OF THE MEDIA
    const isVideo =
      cloudResponse.resource_type === "video" || cloudResponse.format === "mp4";
    // SETTING MEDIA TYPE
    const mediaType = isVideo ? "VIDEO" : "IMAGE";
    // FINDING THE DURATION IN CASE OF VIDEO MEDIA TYPE
    const duration = isVideo ? cloudResponse.duration || 15 : 5;
    // ADDING THE MEDIA TO THE UPLOADED MEDIA ARRAY
    uploadedMedias.push({
      order: i,
      duration,
      type: mediaType,
      url: cloudResponse.secure_url,
      publicId: cloudResponse.public_id,
    });
  }
  // SETTING THE EXPIRY TIME FOR STORY
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // CREATING THE STORY
  const story = await Story.create({
    owner: userId,
    medias: uploadedMedias,
    expiresAt,
  });
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ message: "Story Posted Successfully!", success: true, story });
});

// <= GET ACTIVE STORIES =>
export const getActiveStories = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING LIMIT NUMBER FROM THE REQUEST QUERY
  const limitNumber = req.query?.limit;
  // GETTING QUERY CURSOR FROM THE REQUEST QUERY
  const queryCursor = req.query?.cursor;
  // SETTING LIMIT NUMBER FOR THE QUERY
  const limit = Math.min(50, parseInt(limitNumber, 10) || 20);
  // SETTING QUERY Q=CURSOR FOR THE QUERY
  const cursor = queryCursor ? new Date(queryCursor) : null;
  // SETTING CURRENT TIME
  const now = new Date();
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // BUILDING THE AGGREGATION PIPELINE
  const pipeline = [
    // MATCHING ACTIVE STORIES
    { $match: { expiresAt: { $gt: now } } },
    // ORDERING BY THE CREATED AT TIMESTAMP
    { $sort: { createdAt: -1 } },
    // GROUPING BY OWNER TO GET LATEST CREATED AT AND STORY ID'S LIST
    {
      $group: {
        _id: "$owner",
        storyIds: { $push: "$_id" },
        latestCreatedAt: { $first: "$createdAt" },
        mediaCount: { $sum: { $size: "$medias" } },
      },
    },
  ];
  // IF CURSOR IS PROVIDED, THEN FILTERING THE OWNERS HAVING LATEST < CURSOR
  if (cursor) {
    pipeline.push({ $match: { latestCreatedAt: { $lt: cursor } } });
  }
  // SORTING THE OWNERS BY LATEST DESCENDING AND LIMIT
  pipeline.push({ $sort: { latestCreatedAt: -1 } }, { $limit: limit });
  // EXECUTING THE AGGREGATION
  const activeStories = await Story.aggregate(pipeline);
  // INITIATING THE TRAY TO GROUP STORIES
  const tray = [];
  // ADDING EACH STORY TO TRAY WITH NECESSARY DETAILS
  for (const g of activeStories) {
    // GETTING STORY OWNER DETAILS
    const owner = await User.findById(g._id).select("-password -__v");
    // IF NO OWNER
    if (!owner) continue;
    // CHECKING IF THE STORY IS VIEWED BY THE CURRENT USER
    const viewed = await StoryView.exists({
      story: { $in: g.storyIds },
      viewer: userId,
    });

    const storiesDocs = await Story.find({
      _id: { $in: g.storyIds },
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .select("medias createdAt expiresAt")
      .lean();
    // MAPPING STORIES FOR ORDER-PRESERVING RECONSTRUCTION
    const storyMap = new Map(storiesDocs.map((s) => [s._id.toString(), s]));
    // BUILDING THE STORY STACK PRESERVING THE SAME ORDER OF STORY ID'S
    const storyStack = g.storyIds
      .map((id) => {
        // INDIVIDUAL STORY DOC
        const story = storyMap.get(id.toString());
        // IF NO STORY
        if (!story) return;
        // ENSURING MEDIAS ARE ORDERED BY ASCENDING ORDER
        story.medias = (story.medias || []).sort(
          (a, b) => (a.order || 0) - (b.order || 0)
        );
        // RETURNING COMPACT STORY PAYLOAD
        return {
          storyId: story._id,
          createdAt: story.createdAt,
          expiresAt: story.expiresAt,
          medias: story.medias.map((m) => ({
            url: m.url,
            type: m.type,
            order: m.order,
            duration: m.duration,
            publicId: m.publicId,
          })),
        };
      })
      .filter(Boolean);
    // ADDING THE STORY TO THE TRAY (EXPANDED)
    tray.push({
      storyStack,
      owner: owner,
      hasSeen: !!viewed,
      storyIds: g.storyIds,
      storyCount: g.mediaCount,
      latestStoryAt: g.latestCreatedAt,
    });
  }
  // COMPUTING THE NEXT CURSOR FOR THE NEXT QUERY
  const nextCursor =
    activeStories.length === limit && activeStories.length > 0
      ? activeStories[activeStories.length - 1].latestCreatedAt.toISOString()
      : null;
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, tray, nextCursor });
});

// <= GET STORY =>
export const getStoryHandler = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING STORY ID FROM REQUEST PARAMS
  const storyId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // CHECKING THE VALIDITY OF THE STORY ID
  if (!mongoose.isValidObjectId(storyId)) {
    return res
      .status(400)
      .json({ message: "Invalid Story ID Found!", success: false });
  }
  // FINDING THE STORY THROUGH STORY ID
  const story = await Story.findById(storyId).populate(
    "owner",
    "-password -__v"
  );
  // IF STORY NOT FOUND
  if (!story) {
    return res
      .status(404)
      .json({ message: "Story Not Found!", success: false });
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, story });
});

// <= VIEW HANDLER =>
export const storyViewHandler = expressAsyncHandler(async (req, res) => {
  const userId = req.id;
  // GETTING STORY ID FROM REQUEST PARAMS
  const storyId = req.params.id;
  // GETTING SLIDE INDEX FORM REQUEST BODY
  const { slideIndex } = req.body;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // CHECKING THE VALIDITY OF THE STORY ID
  if (!mongoose.isValidObjectId(storyId)) {
    return res
      .status(400)
      .json({ message: "Invalid Story ID Found!", success: false });
  }
  // FINDING THE STORY THROUGH STORY ID
  const story = await Story.findById(storyId).exec();
  // IF STORY NOT FOUND
  if (!story) {
    return res
      .status(404)
      .json({ message: "Story Not Found!", success: false });
  }
  // ADDING THE STORY VIEW FOR THE CURRENT USER
  const view = await StoryView.findOneAndUpdate(
    { story: story._id, viewer: userId },
    { $setOnInsert: { viewedAt: new Date() }, $set: { slideIndex } },
    { upsert: true, new: true }
  );
  // IF VIEW NOT ADDED
  if (!view) {
    return res
      .status(400)
      .json({ message: "Unable to Record Story View!", success: false });
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, view });
});

// <= GET STORIES VIEWERS =>
export const getStoryViewers = expressAsyncHandler(async (req, res) => {
  const userId = req.id;
  // GETTING STORY ID FROM REQUEST PARAMS
  const storyId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING THE STORY THROUGH STORY ID
  const story = await Story.findById(storyId).exec();
  // IF STORY NOT FOUND
  if (!story) {
    return res
      .status(404)
      .json({ message: "Story Not Found!", success: false });
  }
  // CHECKING IF THE STORY BELONGS THE CURRENT USER
  if (story.owner.toString() !== userId.toString()) {
    return res.status(403).json({
      message: "Unauthorized to perform this Action!",
      success: false,
    });
  }
  // GETTING THE VIEWERS FOR THE STORY
  const viewers = await StoryView.find({ story: story._id }).populate(
    "viewer",
    "-password -__v"
  );
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, viewers });
});
