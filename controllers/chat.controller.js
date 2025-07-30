// <= IMPORTS =>
import mongoose from "mongoose";
import getDataURI from "../utils/dataURI.js";
import { User } from "../models/user.model.js";
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
    type: "ONE-TO-ONE",
    participants: {
      $all: [
        { $elemMatch: { userId: senderId } },
        { $elemMatch: { userId: receiverId } },
      ],
    },
  });
  // HELPER FUNCTION TO CREATE A LIST STYLE CONVERSATION TO RETURN IN RESPONSE
  const buildListConversation = async (conversationId, currentUserId) => {
    // FINDING THE CONVERSATION THROUGH DOCUMENT ID
    const conversation = await Conversation.findById(conversationId)
      .select("-messages")
      .populate({ path: "participants.userId", select: "-password -__v" })
      .lean();
    // GETTING THE OTHER USER PART
    const otherUserId = conversation.participants.find(
      (p) => p.userId._id.toString() !== currentUserId
    ).userId._id;
    // COUNTING THE NUMBER OF UNREAD MESSAGES
    const unreadMessages = await Message.countDocuments({
      conversationId,
      senderId: otherUserId,
      "seenBy.userId": { $ne: currentUserId },
    });
    return { ...conversation, unreadMessages };
  };
  // IF THEY DO NOT HAVE AN ACTIVE CONVERSATION
  if (!haveConversation) {
    // CREATING NEW CONVERSATION BETWEEN THEM
    const newConversation = await Conversation.create({
      participants: [
        { userId: senderId, lastRead: new Date() },
        { userId: receiverId, lastRead: new Date() },
      ],
    });
    // CREATING THE MESSAGE
    const newMessage = await Message.create({
      senderId,
      message,
      conversationId: newConversation._id,
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
      .exec();
    // GETTING THE LIST STYLE CONVERSATION FOR SENDER
    const listSenderConversation = await buildListConversation(
      newConversation._id,
      senderId
    );
    // GETTING THE LIST STYLE CONVERSATION FOR RECEIVER
    const listReceiverConversation = await buildListConversation(
      newConversation,
      receiverId
    );
    // GETTING RECEIVER SOCKET ID
    const receiverSocketId = getReceiverSocketId(receiverId);
    // IF RECEIVER SOCKET ID EXISTS
    if (receiverSocketId) {
      // EMITTING THE NEW MESSAGE EVENT TO THE RECEIVER
      io.to(receiverSocketId).emit("newMessage", {
        populatedMessage,
        chatId: newConversation._id,
      });
      // EMITTING NEW CONVERSATION EVENT TO THE RECEIVER
      io.to(receiverSocketId).emit("newConversation", {
        conversation: listReceiverConversation,
      });
    }
    // SETTING THE MESSAGE DELIVERED AT
    await Message.findByIdAndUpdate(newMessage._id, {
      deliveredAt: new Date(),
    });
    // RETURNING RESPONSE
    return res.status(201).json({
      success: true,
      populatedMessage,
      conversation: listSenderConversation,
    });
  } else {
    // CREATING THE MESSAGE
    const newMessage = await Message.create({
      senderId,
      message,
      conversationId: haveConversation._id,
    });
    // PUSHING THE MESSAGE IN THE EXISTING CONVERSATION
    haveConversation.messages.push(newMessage._id);
    // SAVING THE CONVERSATION
    await haveConversation.save();
    // GETTING THE LIST STYLE CONVERSATION FOR SENDER
    const listSenderConversation = await buildListConversation(
      haveConversation._id,
      senderId
    );
    // PULLING OUT CURRENT USER CONVERSATION PARTICIPANT RECORD
    const myConversationPart = haveConversation?.participants.find(
      (p) => p.userId.toString() === senderId
    );
    // IF THE CURRENT USER HAD SOFT-DELETED THE CHAT
    if (myConversationPart?.deleted) {
      // UPDATING THE CONVERSATION SOFT DELETED FLAG
      await Conversation.updateOne(
        { _id: haveConversation._id, "participants.userId": senderId },
        {
          $set: { "participants.$[me].deleted": false },
          $currentDate: { updatedAt: true },
        },
        { arrayFilters: [{ "me.userId": senderId }] }
      );
    }
    // POPULATING THE CREATED MESSAGE
    const populatedMessage = await Message.findById(newMessage._id)
      .populate({
        path: "senderId",
        select: "-password -__v",
      })
      .exec();
    // GETTING RECEIVER SOCKET ID
    const receiverSocketId = getReceiverSocketId(receiverId);
    // IF RECEIVER SOCKET ID EXISTS
    if (receiverSocketId) {
      // EMITTING THE NEW MESSAGE EVENT TO THE RECEIVER
      io.to(receiverSocketId).emit("newMessage", {
        populatedMessage,
        chatId: haveConversation._id,
      });
    }
    // SETTING THE MESSAGE DELIVERED AT
    await Message.findByIdAndUpdate(newMessage._id, {
      deliveredAt: new Date(),
    });
    // RETURNING RESPONSE
    return res.status(201).json({
      success: true,
      populatedMessage,
      conversation: listSenderConversation,
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
    type: "GROUP",
    participants: { $elemMatch: { userId: senderId, deleted: false } },
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
    .exec();
  // BROADCASTING TO ALL GROUP PARTICIPANTS THE NEW MESSAGE
  for (const participant of conversation.participants) {
    // EXTRACTING THE EACH PARTICIPANT ID
    const participantId = participant.userId.toString();
    // SKIPPING THE MESSAGE SENDER
    if (participantId === senderId) continue;
    // GETTING THE SOCKET ID'S OF PARTICIPANTS
    const socketId = getReceiverSocketId(participantId);
    // IF SOCKET ID EXISTS
    if (socketId) {
      io.to(socketId).emit("newMessage", {
        populatedMessage,
        chatId: conversation._id,
      });
    }
  }
  // SETTING THE MESSAGE DELIVERED AT
  await Message.findByIdAndUpdate(newMessage._id, { deliveredAt: new Date() });
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, populatedMessage });
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
    participants: { $elemMatch: { userId, deleted: false } },
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
  const filter = { participants: { $elemMatch: { userId, deleted: false } } };
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
  // COMPUTING THE UNREAD MESSAGES COUNT FOR EACH CONVERSATION
  const conversationsWithUnreadCounts = await Promise.all(
    // MAPPING OVER EACH FOUND CONVERSATION
    conversations.map(async (chat) => {
      // COUNTING THE UNREAD MESSAGES NOT SENT BY ME AND NOT SEEN BY ME
      const unreadMessages = await Message.countDocuments({
        conversationId: chat._id,
        senderId: { $ne: userId },
        "seenBy.userId": { $ne: userId },
      });
      // RETURNING CHATS WITH UNREAD MESSAGES
      return { ...chat.toObject(), unreadMessages };
    })
  );
  // COMPUTING THE LIST OF ALL ACTIVE ONE-TO-ONE CONVERSATIONS LIST
  const currentConversations = await Conversation.find({
    participants: { $elemMatch: { userId, deleted: false } },
    type: "ONE-TO-ONE",
  })
    .select("participants.userId")
    .lean();
  // EXTRACTING THE IDS FO THE CURRENT CONVERSATIONS PARTICIPANTS
  const chatUsers = currentConversations
    .map((chat) => {
      // SETTING OTHER CHAT PARTICIPANT
      const other = chat.participants.find(
        (p) => p.userId.toString() !== userId
      );
      // RETURNING OTHER PARTICIPANT USER ID
      return other?.userId.toString();
    })
    .filter(Boolean);
  // COMPUTING THE NEXT CURSOR OR NEXT API CALL
  const nextCursor =
    conversationsWithUnreadCounts.length === limitNumber
      ? conversationsWithUnreadCounts[
          conversationsWithUnreadCounts.length - 1
        ].updatedAt.toISOString()
      : null;
  // IF NO ACTIVE CONVERSATIONS
  if (conversationsWithUnreadCounts.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No Active Conversations Found!",
      conversations: [],
      totalConversations,
      nextCursor: null,
      chatUsers,
    });
  }
  // RETURNING RESPONSE
  return res.status(200).json({
    success: true,
    nextCursor,
    conversations: conversationsWithUnreadCounts,
    totalConversations,
    chatUsers,
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
    participants: allParticipants.map((u) => ({ userId: u })),
    messages: [],
    type: "GROUP",
    name,
    avatar,
    avatarPublicId,
  });
  // HELPER FUNCTION TO CREATE A LIST STYLE CONVERSATION TO SEND IN RESPONSE
  const buildGroupListConversation = async (conversationId, currentUserId) => {
    // FINDING THE CONVERSATION THROUGH DOCUMENT ID
    const conversation = await Conversation.findById(conversationId)
      .select("-messages")
      .populate({ path: "participants.userId", select: "-password -__v" })
      .lean();
    // COUNTING THE NUMBER OF UNREAD MESSAGES
    const unreadMessages = await Message.countDocuments({
      conversationId,
      senderId: { $ne: currentUserId },
      "seenBy.userId": { $ne: currentUserId },
    });
    return { ...conversation, unreadMessages };
  };
  // POPULATING THE GROUP CHAT
  const populatedGroupChat = await buildGroupListConversation(
    groupChat._id,
    creatorId
  );
  // EMITTING THE NEW GROUP CONVERSATION EVENT TO OTHER PARTICIPANTS
  for (const participantId of allParticipants) {
    // SKIPPING THE CREATOR
    if (participantId.toString() === creatorId) continue;
    // GETTING THE SOCKETS ID OF OTHER GROUP PARTICIPANTS
    const socketId = getReceiverSocketId(participantId);
    // IF SOCKET ID EXISTS
    if (socketId) {
      // GETTING THE LIST STYLE CONVERSATION FOR EACH PARTICIPANT
      const populatedChat = await buildGroupListConversation(
        groupChat._id,
        participantId
      );
      // EMITTING THE EVENT TO EACH PARTICIPANT
      io.to(socketId).emit("groupConversation", {
        conversation: populatedChat,
      });
    }
  }
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ success: true, conversation: populatedGroupChat });
});

// <= DELETE CONVERSATION =>
export const deleteConversation = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE CONVERSATION ID FROM REQUEST PARAMS
  const conversationId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // CHECKING THE VALIDITY OF THE CONVERSATION ID
  if (!mongoose.isValidObjectId(conversationId)) {
    return res
      .status(400)
      .json({ message: "Invalid Conversation ID!", success: false });
  }
  // FINDING THE CONVERSATION AND ACTIVATING THE SOFT DELETE FOR THE REQUESTED USER
  const conversation = await Conversation.updateOne(
    {
      _id: conversationId,
      type: "ONE-TO-ONE",
      "participants.userId": userId,
    },
    {
      $set: {
        "participants.$.deleted": true,
        "participants.$.deletedAt": new Date(),
      },
      $currentDate: { updatedAt: true },
    }
  );
  // IF CONVERSATION NOT FOUND
  if (!conversation) {
    return res
      .status(404)
      .json({ message: "Conversation Not Found!", success: false });
  }
  // IF THE CONVERSATION WAS NOT MODIFIED
  if (conversation.nModified === 0) {
    return res
      .status(404)
      .json({ message: "Conversation Not Found!", success: false });
  }
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ message: "Chat Deleted Successfully!", success: true });
});

// <= CLEAR CONVERSATION =>
export const clearConversation = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING CONVERSATION ID FROM REQUEST PARAMS
  const conversationId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // CHECKING THE VALIDITY OF THE CONVERSATION ID
  if (!mongoose.isValidObjectId(conversationId)) {
    return res
      .status(400)
      .json({ message: "Invalid Conversation ID!", success: false });
  }
  // FINDING THE CONVERSATION AND UPDATING THE DELETED AT FLAG
  const conversation = await Conversation.updateOne(
    {
      _id: conversationId,
      "participants.userId": userId,
    },
    {
      $set: { "participants.$.deletedAt": new Date() },
      $currentDate: { updatedAt: true },
    }
  );
  // IF CONVERSATION NOT FOUND OR MODIFIED
  if (!conversation || conversation.nModified === 0) {
    return res
      .status(404)
      .json({ message: "Conversation Not Found!", success: false });
  }
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ message: "Chat Cleared Successfully!", success: true });
});

// <= MARK CONVERSATION AS READ =>
export const markConversationRead = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING CONVERSATION ID FROM REQUEST PARAMS
  const conversationId = req.params.id;
  // FINDING THE USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // CHECKING THE VALIDITY OF THE CONVERSATION ID
  if (!mongoose.isValidObjectId(conversationId)) {
    return res
      .status(400)
      .json({ message: "Invalid Conversation ID!", success: false });
  }
  // LOADING THE CONVERSATION TO GET ITS TYPE AND LAST MESSAGE
  const foundConversation = await Conversation.findById(conversationId)
    .select("type messages")
    .lean();
  // FINDING THE LAST MESSAGE IN THE CONVERSATION
  const lastMessage = await Message.findOne({ conversationId })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();
  // COMPUTING THE LAST MESSAGE CREATED AT TIMESTAMP
  const lastReadTimestamp = lastMessage ? lastMessage.createdAt : new Date(0);
  // FINDING THE CONVERSATION AND UPDATING LAST READ FLAG FOR CURRENT USER
  const conversation = await Conversation.updateOne(
    {
      _id: conversationId,
      "participants.userId": userId,
    },
    {
      $set: { "participants.$.lastRead": lastReadTimestamp },
      $currentDate: { updatedAt: true },
    }
  );
  // IF CONVERSATION NOT FOUND OR MODIFIED
  if (!conversation || conversation.nModified === 0) {
    return res
      .status(404)
      .json({ message: "Conversation Not Found!", success: false });
  }
  // MARKING ALL MESSAGES FOR THAT CONVERSATION
  await Message.updateMany(
    {
      conversationId,
      createdAt: { $lte: lastReadTimestamp },
      "seenBy.userId": { $ne: userId },
    },
    {
      $push: { seenBy: { userId, seenAt: new Date() } },
    }
  );
  // RETURNING RESPONSE
  return res.status(200).json({ success: true });
});
