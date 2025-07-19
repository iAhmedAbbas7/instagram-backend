// <= IMPORTS =>
import mongoose from "mongoose";
import getDataURI from "../utils/dataURI.js";
import cloudinary from "../utils/cloudinary.js";
import { Message } from "../models/message.model.js";
import expressAsyncHandler from "express-async-handler";
import { Conversation } from "../models/conversation.model.js";
import { getReceiverSocketId, io } from "../services/socket.js";

// <= SEND MESSAGE =>
export const sendMessage = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT SENDER ID FROM REQUEST ID
  const senderId = req.id;
  // GETTING THE RECEIVER ID FROM REQUEST PARAMS
  const receiverId = req.params.id;
  // GETTING THE MESSAGE FROM REQUEST BODY
  const { message } = req.body;
  // CHECKING IF THE MESSAGE IS EMPTY
  if (!message || message.trim() === "") {
    return res
      .status(400)
      .json({ message: "Message Cannot be Empty!", success: false });
  }
  // CHECKING IF THEY ALREADY HAVE AN ACTIVE CONVERSATION
  const haveConversation = await Conversation.findOne({
    participants: { $all: [senderId, receiverId] },
  });
  // IF THEY DO NOT HAVE AN ACTIVE CONVERSATION
  if (!haveConversation) {
    // CREATING NEW CONVERSATION BETWEEN THEM
    const newConversation = await Conversation.create({
      participants: [senderId, receiverId],
    });
    // CREATING THE MESSAGE
    const newMessage = await Message.create({
      senderId,
      receiverId,
      message,
      conversationId: null,
    });
    // PUSHING THE MESSAGE IN THE NEW CONVERSATION
    newConversation.messages.push(newMessage._id);
    // SAVING THE CONVERSATION
    await newConversation.save();
    // POPULATING THE CREATED MESSAGE
    const populatedMessage = await Message.findById(newMessage._id)
      .populate({
        path: "senderId",
        select: "username fullName profilePhoto followers following posts",
      })
      .populate({
        path: "receiverId",
        select: "username fullName profilePhoto followers following posts",
      })
      .exec();
    //  POPULATING THE NEW CONVERSATION
    const populatedConversation = await Conversation.findById(
      newConversation._id
    )
      .select("-messages")
      .populate({ path: "participants", select: "-password -__v" })
      .lean();
    // GETTING RECEIVER SOCKET ID
    const receiverSocketId = getReceiverSocketId(receiverId);
    // IF RECEIVER SOCKET ID EXISTS
    if (receiverSocketId) {
      // EMITTING THE NEW MESSAGE EVENT TO THE RECEIVER
      io.to(receiverSocketId).emit("newMessage", populatedMessage);
      // EMITTING NEW CONVERSATION EVENT TO THE RECEIVER
      io.to(receiverSocketId).emit("newConversation");
    }
    // RETURNING RESPONSE
    return res.status(201).json({
      success: true,
      populatedMessage,
      conversation: populatedConversation,
    });
  } else {
    // CREATING THE MESSAGE
    const newMessage = await Message.create({
      senderId,
      receiverId,
      message,
      conversationId: null,
    });
    // PUSHING THE MESSAGE IN THE EXISTING CONVERSATION
    haveConversation.messages.push(newMessage._id);
    // SAVING THE CONVERSATION
    await haveConversation.save();
    // POPULATING THE CREATED MESSAGE
    const populatedMessage = await Message.findById(newMessage._id)
      .populate({
        path: "senderId",
        select: "-password -__v",
      })
      .populate({
        path: "receiverId",
        select: "-password -__v",
      })
      .exec();
    //  POPULATING THE ALREADY CREATED CONVERSATION
    const populatedConversation = await Conversation.findById(
      haveConversation._id
    )
      .select("-messages")
      .populate({ path: "participants", select: "-password -__v" })
      .lean();
    // GETTING RECEIVER SOCKET ID
    const receiverSocketId = getReceiverSocketId(receiverId);
    // IF RECEIVER SOCKET ID EXISTS
    if (receiverSocketId) {
      // EMITTING THE NEW MESSAGE EVENT TO THE RECEIVER
      io.to(receiverSocketId).emit("newMessage", populatedMessage);
    }
    // RETURNING RESPONSE
    return res.status(201).json({
      success: true,
      populatedMessage,
      conversation: populatedConversation,
    });
  }
});

// SEND GROUP MESSAGE =>
export const sendGroupMessage = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID AS SENDER ID
  const senderId = req.id;
  // GETTING THE CONVERSATION ID FROM REQUEST PARAMS
  const conversationId = req.params.id;
  // GETTING THE MESSAGE FROM REQUEST BODY
  const { message } = req.body;
  // VALIDATING THE MESSAGE TEXT
  if (!message || !message.trim()) {
    return res
      .status(400)
      .json({ message: "Message cannot be Empty!", success: false });
  }
  // VALIDATING THE CONVERSATION ID
  if (!mongoose.isValidObjectId(conversationId)) {
    return res
      .status(400)
      .json({ message: "Invalid Conversation ID!", success: false });
  }
  // FINDING THE CONVERSATION IN THE CONVERSATION MODEL
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: senderId,
  });
  // IF CONVERSATION NOT FOUND
  if (!conversation) {
    return res
      .status(400)
      .json({ message: "Conversation Not Found!", success: false });
  }
  // CREATING THE NEW MESSAGE
  const newMessage = await Message.create({
    senderId,
    receiverId: null,
    conversationId,
    message,
  });
  // PUSHING THE MESSAGE IN THE CONVERSATION MESSAGES
  conversation.messages.push(newMessage._id);
  // SAVING THE CONVERSATION
  await conversation.save();
  // POPULATING THE NEW MESSAGE
  const populatedMessage = await Message.findById(newMessage._id)
    .populate({
      path: "senderId",
      select: "-password -__v",
    })
    .populate({
      path: "receiverId",
      select: "-password -__v",
    })
    .exec();
  // BROADCASTING TO ALL GROUP PARTICIPANTS THE NEW MESSAGE
  for (const p of conversation.participants.map((p) => p.toString())) {
    // SKIPPING THE MESSAGE SENDER
    if (p === senderId) continue;
    // GETTING THE SOCKET ID'S OF PARTICIPANTS
    const socketId = getReceiverSocketId(p);
    // IF SOCKET ID EXISTS
    if (socketId) {
      io.to(socketId).emit("newMessage", populatedMessage);
    }
  }
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, populatedMessage });
});

// <= GET ALL MESSAGES =>
export const getAllMessages = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE OTHER PARTICIPANT ID FROM REQUEST PARAMS
  const receiverId = req.params.id;
  // GETTING LIMIT NUMBER AND CURSOR FROM REQUEST QUERY
  const { limit = 15, cursor } = req.query;
  // SETTING LIMIT NUMBER
  const limitNumber = Math.min(50, parseInt(limit));
  // CHECKING IF THEY HAVE AN ACTIVE CONVERSATION
  const conversation = await Conversation.findOne({
    type: "ONE-TO-ONE",
    participants: {
      $all: [
        { $elemMatch: { userId, deletedAt: null } },
        { $elemMatch: { userId: receiverId } },
      ],
    },
  }).lean();
  // PULLING OUT MY DELETION TIMESTAMP
  const myDeletionTimestamp = conversation?.participants.find(
    (p) => p.userId.toString() === userId
  );
  // CALCULATING THE DELETION TIME IF ANY
  const deletionTime = myDeletionTimestamp?.deletedAt ?? new Date(0);
  // IF THEY DO NOT HAVE AN ACTIVE CONVERSATION THEN SENDING EMPTY MESSAGES ARRAY
  if (!conversation && !cursor)
    return res
      .status(200)
      .json({ success: true, messages: [], pagination: { nextCursor: null } });
  // INITIATING FILTER FOR FETCHING MESSAGES
  const filter = {};
  // IF CONVERSATION EXISTS
  if (conversation) {
    (filter._id = { $in: conversation.messages }),
      (filter.createdAt = { $gt: deletionTime });
  }
  // IF CURSOR IS PROVIDED
  if (cursor) {
    filter.createdAt = {
      ...filter.createdAt,
      $lt: new Date(cursor),
    };
  }
  // FETCHING MESSAGES NEWEST TO OLDEST
  const page = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limitNumber)
    .populate({ path: "senderId", select: "-password -__v" })
    .populate({ path: "receiverId", select: "-password -__v" })
    .lean();
  // SETTING HAS MORE FLAG
  const hasMore = page.length === limitNumber;
  // SETTING NEXT CURSOR BASED ON HAS MORE FLAG
  const nextCursor = hasMore
    ? page[page.length - 1].createdAt.toISOString()
    : null;
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ success: true, messages: page, pagination: { nextCursor } });
});

// <= GET CONVERSATION MESSAGES =>
export const getConversationMessages = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING CONVERSATION ID FROM REQUEST PARAMS
  const conversationId = req.params.id;
  // GETTING LIMIT NUMBER AND CURSOR FROM REQUEST QUERY
  const { limit = 15, cursor } = req.query;
  // SETTING LIMIT NUMBER
  const limitNumber = Math.min(50, parseInt(limit));
  // CHECKING THE VALIDITY OF THE CONVERSATION ID
  if (!mongoose.isValidObjectId(conversationId)) {
    return res
      .status(400)
      .json({ message: "Invalid Conversation ID Found!", success: false });
  }
  // FINDING THE CONVERSATION BY ENSURING THE LOGGED IN USER IS A PARTICIPANT
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: { $elemMatch: { userId, deletedAt: null } },
  }).lean();
  // IF CONVERSATION NOT FOUND
  if (!conversation) {
    return res
      .status(400)
      .json({ message: "Conversation Not Found!", success: false });
  }
  // PULLING OUT MY DELETION TIMESTAMP
  const myDeletionTimestamp = conversation?.participants.find(
    (p) => p.userId.toString() === userId
  );
  // CALCULATING THE DELETION TIME IF ANY
  const deletionTime = myDeletionTimestamp?.deletedAt ?? new Date(0);
  // INITIATING FILTER FOR FETCHING MESSAGES
  const filter = {
    _id: { $in: conversation.messages },
    createdAt: { $gt: deletionTime },
  };
  // IF CURSOR IS PROVIDED
  if (cursor) {
    filter.createdAt.$lt = new Date(cursor);
  }
  // FETCHING MESSAGES NEWEST TO OLDEST
  const page = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limitNumber)
    .populate({ path: "senderId", select: "-password -__v" })
    .populate({ path: "receiverId", select: "-password -__v" })
    .lean();
  // SETTING HAS MORE FLAG
  const hasMore = page.length === limitNumber;
  // SETTING NEXT CURSOR BASED ON HAS MORE FLAG
  const nextCursor = hasMore
    ? page[page.length - 1].createdAt.toISOString()
    : null;
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ success: true, messages: page, pagination: { nextCursor } });
});

// <= GET USER CONVERSATIONS =>
export const getUserConversations = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING PAGE NUMBER AND CURSOR FROM REQUEST QUERY
  const { limit, cursor } = req.query;
  // SETTING LIMIT NUMBER
  const limitNumber = Math.min(50, parseInt(limit) || 10);
  // BUILDING OUR BASE FILTER
  const filter = { participants: { $elemMatch: { userId, deletedAt: null } } };
  // SETTING FILTER BASED ON CURSOR PROVIDED
  if (cursor) filter.updatedAt = { $lt: new Date(cursor) };
  // FETCHING THE SLICED CONVERSATIONS & TOTAL NUMBER FOR THE USER
  const [conversations, totalConversations] = await Promise.all([
    // FINDING THE CONVERSATIONS
    Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .limit(limitNumber)
      .select("-messages")
      // POPULATING THE PARTICIPANTS INFO
      .populate({ path: "participants.userId", select: "-password -__v" }),
    // COUNTING TOTAL CONVERSATIONS
    Conversation.countDocuments(filter),
  ]);
  // COMPUTING THE NEXT CURSOR OR NEXT API CALL
  const nextCursor =
    conversations.length === limitNumber
      ? conversations[conversations.length - 1].updatedAt().toISOString()
      : null;
  // IF NO ACTIVE CONVERSATIONS
  if (conversations.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No Active Conversations Found!",
      conversations: [],
      totalConversations,
      nextCursor: null,
    });
  }
  // RETURNING RESPONSE
  return res.status(200).json({
    success: true,
    nextCursor,
    conversations,
    totalConversations,
  });
});

// <= CREATE GROUP CONVERSATION =>
export const createGroupChat = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID AS CREATOR ID
  const creatorId = req.id;
  // GETTING GROUP PARTICIPANTS & NAME FROM REQUEST BODY
  let { participants = [], name } = req.body;
  // MAKING SURE THE NAME IS NOT EMPTY
  if (!name.trim()) {
    return res
      .status(400)
      .json({ message: "Name cannot be Empty", success: false });
  }
  // CONVERTING THE PARTICIPANTS IN TO AN ARRAY
  if (typeof participants === "string") {
    participants = JSON.parse(participants);
  }
  // ENSURING PARTICIPANTS INS AN ARRAY
  if (!Array.isArray(participants)) {
    return res
      .status(400)
      .json({ message: "Participants must be an Array!", success: false });
  }
  // INCLUDING THE CREATOR ID IN THE PARTICIPANTS ARRAY
  const allParticipants = Array.from(new Set([...participants, creatorId]));
  // MAKING SURE GROUP HAS AT LEAST THREE PARTICIPANTS
  if (allParticipants.length < 3) {
    return res.status(400).json({
      message: "A Group Chat must have at least 3 Participants!",
      success: false,
    });
  }
  // INITIATING AVATAR & AVATAR PUBLIC ID
  let avatar = "";
  let avatarPublicId = "";
  // IF GROUP AVATAR WAS PROVIDED
  if (req.file) {
    // GETTING GROUP AVATAR FROM REQUEST FILE
    const file = req.file;
    // GETTING THE DATA URI OF THE FILE FROM HANDLER
    const fileURI = getDataURI(file);
    // CLOUDINARY UPLOAD
    const cloudResponse = await cloudinary.uploader.upload(fileURI.content);
    // IF CLOUDINARY UPLOAD FAILS
    if (!cloudResponse) {
      return res
        .status(500)
        .json({ message: "Failed to Upload Group Avatar!", success: false });
    }
    // SETTING AVATAR SECURE URL
    avatar = cloudResponse.secure_url;
    // SETTING AVATAR PUBLIC ID
    avatarPublicId = cloudResponse.public_id;
  }
  // CREATING GROUP CONVERSATION
  const groupChat = await Conversation.create({
    participants: allParticipants,
    messages: [],
    type: "GROUP",
    name,
    avatar,
    avatarPublicId,
  });
  // POPULATING THE GROUP CHAT
  const populatedGroupChat = await Conversation.findById(groupChat._id)
    .populate({
      path: "participants",
      select: "-password -__v",
    })
    .select("-messages")
    .lean();
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ success: true, conversation: populatedGroupChat });
});
