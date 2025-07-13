// <= IMPORTS =>
import mongoose from "mongoose";
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
      .populate({ path: "participants", select: "-password -__v" })
      .lean();
    // GETTING RECEIVER SOCKET ID
    const receiverSocketId = getReceiverSocketId(receiverId);
    // IF RECEIVER SOCKET ID EXISTS
    if (receiverSocketId) {
      // EMITTING THE NEW MESSAGE EVENT TO THE RECEIVER
      io.to(receiverSocketId).emit("newMessage", populatedMessage);
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
      .populate({ path: "participants", select: "-password -__v" })
      .lean();
    // GETTING RECEIVER SOCKET ID
    const receiverSocketId = getReceiverSocketId(receiverId);
    // IF RECEIVER SOCKET ID EXISTS
    if (receiverSocketId) {
      // EMITTING THE NEW MESSAGE EVENT TO THE RECEIVER
      io.to(receiverSocketId).emit("newMessage", populatedMessage);
      io.to(receiverSocketId).emit("newConversation");
    }
    // RETURNING RESPONSE
    return res.status(201).json({
      success: true,
      populatedMessage,
      conversation: populatedConversation,
    });
  }
});

// <= GET ALL MESSAGES =>
export const getAllMessages = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE OTHER PARTICIPANT ID FROM REQUEST PARAMS
  const receiverId = req.params.id;
  // CHECKING IF THEY HAVE AN ACTIVE CONVERSATION
  const conversation = await Conversation.findOne({
    participants: { $all: [userId, receiverId] },
  }).populate({
    path: "messages",
    populate: [
      {
        path: "senderId",
        select: "-password -__v",
      },
      {
        path: "receiverId",
        select: "-password -__v",
      },
    ],
  });
  // IF THEY DO NOT HAVE AN ACTIVE CONVERSATION THEN SENDING EMPTY MESSAGES ARRAY
  if (!conversation)
    return res.status(200).json({ success: true, messages: [] });
  // IF THEY HAVE AN ACTIVE CONVERSATION THEN GETTING ALL THE MESSAGES
  return res
    .status(200)
    .json({ success: true, messages: conversation?.messages });
});

// <= GET CONVERSATION MESSAGES =>
export const getConversationMessages = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING CONVERSATION ID FROM REQUEST PARAMS
  const conversationId = req.params.id;
  // CHECKING THE VALIDITY OF THE CONVERSATION ID
  if (!mongoose.isValidObjectId(conversationId)) {
    return res
      .status(400)
      .json({ message: "Invalid Conversation ID Found!", success: false });
  }
  // FINDING THE CONVERSATION BY ENSURING THE LOGGED IN USER IS A PARTICIPANT
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  })
    .populate({
      path: "messages",
      populate: [
        {
          path: "senderId",
          select: "-password -__v",
        },
        {
          path: "receiverId",
          select: "-password -__v",
        },
      ],
    })
    .lean();
  // IF CONVERSATION NOT FOUND
  if (!conversation) {
    return res
      .status(400)
      .json({ message: "Conversation Not Found!", success: false });
  }
  // RETURNING RESPONSE
  return res
    .status(200)
    .json({ success: true, messages: conversation?.messages });
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
  const filter = { participants: userId };
  // SETTING FILTER BASED ON CURSOR PROVIDED
  if (cursor) filter.updatedAt = { $lt: new Date(cursor) };
  // FETCHING THE SLICED CONVERSATIONS & TOTAL NUMBER FOR THE USER
  const [conversations, totalConversations] = await Promise.all([
    // FINDING THE CONVERSATIONS
    Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .limit(limitNumber)
      // POPULATING THE PARTICIPANTS INFO
      .populate({ path: "participants", select: "-password -__v" })
      // POPULATING THE LAST MESSAGE IN THE CONVERSATION
      .populate({
        path: "messages",
        options: { sort: { createdAt: -1 }, limit: 1 },
        populate: {
          path: "senderId",
          select: "-password -__v",
        },
      }),
    // COUNTING TOTAL CONVERSATIONS
    Conversation.countDocuments({ participants: userId }),
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
